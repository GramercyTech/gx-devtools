# Media uploads (recorded video, audio, camera captures, large files)

Load this when the plugin records or uploads video/audio (especially from `MediaRecorder`), or uploads any file that can reach 20 MB.

## Patch the duration of WebM recordings before uploading

Browser `MediaRecorder` output (Firefox and Chrome) is streamed WebM with **no duration in the file header**. The platform's video transcoder reads it as 0 seconds and the job fails (`startTimeOffset is 0s ... minimum duration of all inputs ... (0s)`). The post then never gets a playable video, and on current platform builds the failure isn't reported back (EZ-3408).

Patch the duration in the browser with `@fix-webm-duration/fix`, as the experience-builder app does. It returns a new Blob that keeps the original `type`, codecs included:

```javascript
import { fixWebmDuration } from "@fix-webm-duration/fix"

let recordingStartTime = 0
recorder.onstart = () => {
	recordingStartTime = performance.now()
}
recorder.onstop = async () => {
	let blob = new Blob(chunks, { type: recorder.mimeType })
	const durationMs = performance.now() - recordingStartTime
	if (blob.type.includes("webm")) {
		try {
			blob = await fixWebmDuration(blob, durationMs, { logger: false })
		} catch (error) {
			console.warn("Could not fix WebM duration; transcoding may fail", error)
		}
	}
	// ...then upload with uploadMedia()
}
```

- Only WebM needs this. MP4 recordings (Safari, or Chrome when you request `video/mp4`) already have a duration.
- Adding the package is a new plugin dependency (`npm install @fix-webm-duration/fix`), so confirm with the user first.
- Prefer `video/mp4` on iOS and WebM elsewhere, checking with `MediaRecorder.isTypeSupported()` in order: `video/webm;codecs=vp9,opus`, `video/webm;codecs=vp8,opus`, `video/webm`.
- Portrait orientation is fine. The transcoder keeps the source's width and height, and handles rotation metadata.

## What the server expects

A working upload part looks like this:

```
Content-Disposition: form-data; name="attachment"; filename="file.webm"
Content-Type: video/webm;codecs=vp8,opus
```

- **Filename:** a plain extension (`.webm`, `.mp4`). Codec parameters in the filename break server transcoding.
- **Content-Type:** the recorder's **full** MIME type, codecs included. Do not strip it. The server needs it.

## Upload with `uploadMedia`

Copy this module into the plugin (e.g. `src/utils/mediaUpload.mjs`). It's the docs site's tested example ("Uploading Recorded Video, Audio and Large Files", `/examples/media-uploads/mediaUpload.mjs`). Don't hand-roll a different version.

```javascript
/**
 * Upload a recorded or picked media Blob through `store.callApi`.
 *
 * - Under the threshold, the bytes go inline as multipart. The extension goes
 *   in the data key (`attachment.webm`) because the platform store names the
 *   part from it; the File keeps the recorder's full MIME type.
 * - At or above it, the create call sends the file details instead of bytes
 *   (as JSON, since no Blob is present), and the bytes are PUT to the signed
 *   storage URL the platform returns in `data.upload_urls[filename]`.
 */

export const LARGE_UPLOAD_THRESHOLD_BYTES = 20 * 1024 * 1024

const EXTENSIONS = {
	"video/webm": "webm",
	"video/mp4": "mp4",
	"video/quicktime": "mov",
	"audio/webm": "webm",
	"audio/mp4": "m4a",
	"audio/ogg": "ogg",
	"audio/mpeg": "mp3",
	"audio/wav": "wav",
}

export class UploadError extends Error {
	/**
	 * @param {string} message
	 * @param {{ record?: any, cause?: unknown }} [details]
	 */
	constructor(message, { record = null, cause } = {}) {
		super(message, { cause })
		this.name = "UploadError"
		// The created record, when the create call succeeded but the bytes did not
		// arrive. It stays "waiting for upload"; delete it or show it as failed.
		this.record = record
	}
}

/**
 * Plain extension for the filename; the full type (codecs included) is kept.
 * @param {string} type
 * @returns {{ ext: string, mime: string }}
 */
export function uploadFormat(type) {
	const mime = String(type || "").trim()
	const ext = EXTENSIONS[mime.split(";")[0].trim().toLowerCase()]
	if (!ext) {
		throw new UploadError(`Unsupported media type: ${mime || "(empty)"}`)
	}
	return { ext, mime }
}

/**
 * PUT bytes to a signed storage URL. Uses a bare XMLHttpRequest so no shared
 * HTTP-client defaults or interceptors can attach GxP credentials, and so
 * upload progress is available.
 * @param {string} url
 * @param {Blob} blob
 * @param {string} type
 * @param {(event: ProgressEvent) => void} [onProgress]
 * @returns {Promise<void>}
 */
export function putToSignedUrl(url, blob, type, onProgress) {
	return new Promise((resolve, reject) => {
		const xhr = new globalThis.XMLHttpRequest()
		xhr.open("PUT", url)
		xhr.setRequestHeader("Content-Type", type)
		if (onProgress) {
			xhr.upload.onprogress = onProgress
		}
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				resolve()
			} else {
				reject(new Error(`Storage upload failed (HTTP ${xhr.status})`))
			}
		}
		xhr.onerror = () =>
			reject(new Error("Storage upload failed (network error)"))
		xhr.send(blob)
	})
}

/**
 * @param {{ callApi: Function, userSession?: string | null }} store
 * @param {object} options
 * @param {string} options.operationId create/update operation, e.g. 'social-streams.posts.store'
 * @param {string} options.identifier declared dependency identifier
 * @param {Blob} options.blob the media; patch WebM recordings with fixWebmDuration first
 * @param {string} [options.field] the operation's file field (check the spec)
 * @param {object} [options.data] other body fields
 * @param {boolean} [options.withUserSession] add `user_session` (social stream posts); throws if there is no session
 * @param {(event: ProgressEvent) => void} [options.onProgress] large uploads only
 * @param {number} [options.threshold]
 * @param {typeof putToSignedUrl} [options.put]
 * @returns {Promise<any>} the create/update response (`{ data: record }`)
 */
export async function uploadMedia(store, options) {
	const {
		operationId,
		identifier,
		blob,
		field = "attachment",
		data = {},
		withUserSession = false,
		onProgress,
		threshold = LARGE_UPLOAD_THRESHOLD_BYTES,
		put = putToSignedUrl,
	} = options
	const { ext, mime } = uploadFormat(blob?.type)
	if (withUserSession && !store.userSession) {
		throw new UploadError(
			"No attendee session: the post would not be credited to anyone",
		)
	}
	// Spread last so caller data can't override the attendee's session.
	const session = withUserSession ? { user_session: store.userSession } : {}

	if (blob.size < threshold) {
		const file = new File([blob], `${field}.${ext}`, { type: mime })
		return store.callApi(operationId, identifier, {
			...data,
			[`${field}.${ext}`]: file,
			...session,
		})
	}

	const filename = `${field}.${ext}`
	const response = await store.callApi(operationId, identifier, {
		...data,
		[field]: {
			filename,
			size: blob.size,
			type: mime,
			last_modified: Date.now(),
			large_upload: true,
		},
		...session,
	})
	const record = response?.data ?? null
	const uploadUrl = record?.upload_urls?.[filename]
	if (!uploadUrl) {
		throw new UploadError(`No signed upload URL returned for ${filename}`, {
			record,
		})
	}
	try {
		await put(uploadUrl, blob, mime, onProgress)
	} catch (cause) {
		throw new UploadError(cause?.message || "Storage upload failed", {
			record,
			cause,
		})
	}
	return response
}
```

Usage, from the recorder's `onstop` after `fixWebmDuration`:

```javascript
const response = await uploadMedia(store, {
	operationId: "social-streams.posts.store",
	identifier: "social_stream",
	blob,
	data: { body: caption.value },
	withUserSession: true,
	onProgress: (e) => {
		progress.value = e.lengthComputable
			? Math.round((e.loaded / e.total) * 100)
			: null
	},
})
```

## Rules

- **Filename vs Content-Type.** On the current platform, `callApi` names a part `file.` plus everything after "/" in the MIME type and ignores the File's name (EZ-3408). So always put the extension in the data key (`attachment.webm`), and keep the full MIME type, codecs included, on the File. Never strip codecs from the type, and never build the extension by slicing it.
- **Files of 20 MB or more** use the two-step flow: details object (sent as JSON), then a PUT to `response.data.upload_urls[filename]`. This PUT to platform-returned storage is the one allowed raw request. Use a bare XHR or `fetch`, never a shared axios instance whose defaults or interceptors might attach GxP credentials. The PUT's Content-Type must exactly equal the `type` you declared, and the URL expires after 10 minutes.
- **Threshold.** The platform default is 20 MB (`filesystems.large_upload_threshold`), and plugins can't read it from the store. The social stream create endpoint accepts large-upload details for any size, so a lower threshold is safe. Never send 20 MB or more inline.
- **Failure.** If no upload URL comes back or the PUT fails, the post already exists in `waiting_for_upload`. `uploadMedia` throws `UploadError` with `.record`. Calling it again creates a second post. Delete the orphan if the plugin has delete permission, otherwise show it as failed. Never report success.
- **Social stream posts:** `withUserSession: true` adds `user_session: store.userSession` after caller data, and throws before sending if there's no session. It's optional for the API, but posts without it aren't credited to the attendee.
- `onProgress` only fires for the large-upload PUT. Inline uploads report no progress.
- **Types.** Only types the module maps (`webm`, `mp4`, `mov`, `m4a`, `ogg`, `mp3`, `wav`) are accepted. With `MediaRecorder.isTypeSupported()`, check `video/mp4` first on iOS/Safari, and WebM first elsewhere. `audio/webm` recordings need the same duration patch.
- Field names (`attachment`, `upload`, …) differ per endpoint. Confirm with `api_get_operation_parameters`.
- The local mock API returns no signed upload URLs. Test large uploads against a real environment (`VITE_API_ENV=develop`), in Firefox and a Chromium browser, and inspect the multipart headers and the PUT status.
