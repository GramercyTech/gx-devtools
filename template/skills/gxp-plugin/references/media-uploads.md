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

## The `callApi` filename gotcha

`store.callApi` uploads `Blob`/`File` values as multipart. On current platform builds it **ignores the `File`'s own name** and names the part `file.<ext>`, where `<ext>` is everything after the `/` in the MIME type. A Firefox recording (`video/webm;codecs=vp8,opus`) therefore uploads as `file.webm;codecs=vp8,opus` and transcoding fails.

**Set the extension through the data key**: `attachment.webm` sends field `attachment` with filename `file.webm`. This works on every platform version, including after the store fix, so always use it for media:

```javascript
/**
 * MediaRecorder reports types with codec params ("video/webm;codecs=vp8,opus").
 * Plain extension for the filename; full type kept for Content-Type.
 */
function uploadFormat(type) {
	const raw = String(type || "").trim()
	const base = raw.split(";")[0].trim().toLowerCase()
	const ext = base === "video/mp4" ? "mp4" : "webm"
	return { ext, mime: raw || `video/${ext}` }
}

const { ext, mime } = uploadFormat(recorder.mimeType || blob.type)
const file = new File([blob], `video-${Date.now()}.${ext}`, { type: mime })
// The `.ext` suffix on the key sets the filename; the field name stays "attachment".
await store.callApi(operationId, identifier, { [`attachment.${ext}`]: file })
```

Rules:

- Never strip codec parameters from the Content-Type, and never put them in the filename.
- Never derive the extension by slicing the raw MIME type (`type.split("/")[1]` gives `webm;codecs=vp8,opus`).
- Always pass the extension in the data key (`<field>.<ext>`). Don't rely on the `File` name surviving `callApi`.
- Browsers differ: Firefox records WebM; Safari typically records MP4. Map both explicitly rather than assuming one.
- Discover the upload operation and its file field name with the MCP (`api_find_endpoints_by_schema`, `api_get_operation_parameters`). `attachment` above is an example.
- Test in at least Firefox and one Chromium browser, and inspect the outgoing request's multipart headers, before declaring a recording feature done.

## Files of 20 MB or more: the `large_upload` flow

The platform does not accept file bytes inline at or above `filesystems.large_upload_threshold` (default **20 MB**; configurable per environment; maximum 10 GB). Those uploads take two steps:

1. **Create/update with metadata instead of bytes.** Send the file field as an object. `callApi` flattens it to `attachment[filename]`, `attachment[size]`, etc. for multipart, and it also works as JSON:

   ```javascript
   { attachment: { filename: `post.${ext}`, size: blob.size, type: blob.type, last_modified: Date.now(), large_upload: true } }
   ```

2. **PUT the bytes to the presigned URL** in the response's `upload_urls`, keyed by the `filename` you sent. That URL points at object storage (S3/GCS), not a platform endpoint, so this is the **one place a raw `axios.put` is correct**. It isn't a `callApi` operation, and you must not send GxP auth headers to it.

```javascript
import axios from "axios"

const LARGE_UPLOAD_THRESHOLD_BYTES = 20 * 1024 * 1024

async function uploadMedia(
	operationId,
	identifier,
	blob,
	extraData = {},
	onUploadProgress,
) {
	const raw = String(blob.type || "").trim()
	const ext = raw.split(";")[0].trim().toLowerCase().split("/")[1] || "bin"

	if (blob.size < LARGE_UPLOAD_THRESHOLD_BYTES) {
		return store.callApi(operationId, identifier, {
			...extraData,
			[`attachment.${ext}`]: blob,
		})
	}

	const filename = `post.${ext}`
	const response = await store.callApi(operationId, identifier, {
		...extraData,
		attachment: {
			filename,
			size: blob.size,
			type: raw,
			last_modified: Date.now(),
			large_upload: true,
		},
	})
	const uploadUrl =
		response?.upload_urls?.[filename] ?? response?.data?.upload_urls?.[filename]
	if (!uploadUrl) {
		throw new Error(`No presigned upload URL returned for ${filename}`)
	}
	await axios.put(uploadUrl, blob, {
		headers: { "Content-Type": raw || "application/octet-stream" },
		onUploadProgress,
	})
	return response
}
```

Large-upload rules:

- **Route on size, and use one threshold for every media type.** For files under the threshold the server returns an empty `upload_urls`. If you force the large flow on a small file, its bytes are silently dropped.
- **The PUT `Content-Type` must exactly equal the `type` sent in step 1.** The URL is signed for that type, so any difference (including stripped codecs) makes storage reject the PUT.
- The presigned URL expires after **10 minutes**. PUT immediately after step 1, and don't cache the URL.
- A missing `upload_urls[filename]` is a failure. Surface it to the user. Don't report success.
- The record exists after step 1 but stays `waiting_for_upload` until the PUT lands and processing runs. Show progress (`onUploadProgress`), and don't treat step 1 alone as done.
- **Social stream posts:** send `user_session: store.userSession` with the create call so the post is credited to the attendee. It's optional (the server copies it into post metadata), but posts without it are anonymous. Spread it after caller data so a payload can't override it.
- Field names (`attachment`, `upload`, …) differ per endpoint. Confirm with `api_get_operation_parameters`.
- The local mock API does not return presigned URLs, so test this path against a real environment (`VITE_API_ENV=develop`).
