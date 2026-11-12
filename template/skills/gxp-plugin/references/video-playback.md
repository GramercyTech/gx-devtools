# Video playback (HLS / Shaka) and playback analytics

Load this when the plugin plays platform video, such as social stream posts, with Shaka Player or any HLS player, or reports playback analytics.

The full, tested recipe is the docs site's **"Video Playback and Analytics with Shaka"** guide (`docs_search` "Shaka"), with a downloadable `GxpSocialVideo.vue`, `videoAnalytics.mjs`, `signedManifest.mjs` and `track-events.json`. Start from those files instead of writing a player from scratch.

## Use the right fields

- Play `post.file_path_manifest_url`, the HLS master playlist. It is `null` until transcoding finishes, so show a "still processing" state. If it never appears, the upload or transcode failed (see `media-uploads.md`).
- Remount the player (`:key` including the manifest URL) when the post or its manifest URL changes. Don't hot-swap sources in a watcher.

## Signed manifests need the signature on every request

`file_path_manifest_url` is a Google Cloud CDN **URL-prefix** signed URL. Its query (`URLPrefix`, `Expires`, `KeyName`, `Signature`) authorizes every file under the manifest's folder. Shaka resolves variant playlists and segments relative to the manifest, and those requests don't carry the query. Without a request filter, the first child request fails and the video never plays.

Register this filter after `player.attach()` and **before** `player.load()`, and remove it on unmount. It's the docs site's tested `signedManifest.mjs`:

```javascript
/**
 * Platform HLS manifests (`file_path_manifest_url`) carry a Cloud CDN
 * URL-prefix signature: one query (`URLPrefix`, `Expires`, `KeyName`,
 * `Signature`) authorizes every URL that starts with the signed prefix — the
 * manifest's folder. Shaka resolves variant playlists and segments relative to
 * the manifest, which drops that query, so add it back — but only for requests
 * inside the signed prefix that have no query of their own. Never send it
 * anywhere else.
 */

function decodeBase64Url(value) {
	const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
	return globalThis.atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4))
}

/**
 * The signed scope is the `URLPrefix` the CDN will enforce. Fall back to the
 * manifest's folder only if it can't be decoded, and refuse a whole-host scope.
 * @param {string} manifestUrl
 * @returns {{ query: string, prefix: string } | null}
 */
export function parseSignedManifest(manifestUrl) {
	let url
	try {
		url = new URL(manifestUrl)
	} catch {
		return null
	}
	const query = url.search.slice(1)
	if (!query) {
		return null
	}
	let scope =
		url.origin + url.pathname.slice(0, url.pathname.lastIndexOf("/") + 1)
	const encodedPrefix = url.searchParams.get("URLPrefix")
	if (encodedPrefix) {
		try {
			const decoded = new URL(decodeBase64Url(encodedPrefix).trim())
			if (decoded.origin === url.origin) {
				scope = decoded.origin + decoded.pathname
			}
		} catch {
			// Keep the folder fallback.
		}
	}
	const prefix = scope.endsWith("/") ? scope : `${scope}/`
	if (prefix === `${url.origin}/`) {
		return null
	}
	return { query, prefix }
}

/**
 * @param {string} uri
 * @param {{ query: string, prefix: string } | null} signed
 * @returns {string}
 */
export function signUri(uri, signed) {
	if (!signed || !uri) {
		return uri
	}
	let target
	try {
		target = new URL(uri)
	} catch {
		return uri
	}
	if (
		target.search ||
		!(target.origin + target.pathname).startsWith(signed.prefix)
	) {
		return uri
	}
	target.search = signed.query
	return target.href
}

/**
 * Register a Shaka request filter that signs manifest and segment requests.
 * Call after `player.attach()` and before `player.load()`. Returns a function
 * that removes the filter.
 * @param {{ getNetworkingEngine: () => any }} player
 * @param {string} manifestUrl
 * @returns {() => void}
 */
export function registerSignedRequests(player, manifestUrl) {
	const signed = parseSignedManifest(manifestUrl)
	const engine = player.getNetworkingEngine()
	if (!signed || !engine) {
		return () => {}
	}
	const filter = (_type, request) => {
		request.uris = request.uris.map((uri) => signUri(uri, signed))
	}
	engine.registerRequestFilter(filter)
	return () => engine.unregisterRequestFilter(filter)
}

// usage
const stopSignedRequests = registerSignedRequests(
	player,
	post.file_path_manifest_url,
)
await player.load(post.file_path_manifest_url)
// onBeforeUnmount: stopSignedRequests(); player.destroy()
```

Rules:

- Scope the signature to the decoded `URLPrefix` (normally the manifest's folder) on the manifest's origin. Refuse a whole-host scope. Never append it to other hosts, other posts' folders, or URLs that already have a query.
- Never add GxP API credentials to media requests. Shaka fetching platform-returned CDN URLs is expected; it's not a raw platform API call.
- The signature expires at the query's `Expires` timestamp (default 3,600 minutes after the post was serialized), possibly mid-playback. On a playback error, re-fetch the post once through `callApi` (`social-streams.posts.show`) and remount with the new URL. The docs example emits `playback-error` for this. Never construct storage URLs.
- Never send the signed URL, or its query, to analytics or logs.

## Playback analytics are not auto-extracted

`config_extract_strings` / `gxdev extract-config` only detect `gxp-track` attributes and `gxp.track("literal.name", …)` / `gxpTrack("literal.name", …)` calls. Events sent through a helper, such as `emit(name)` → `send(name, props)`, which is how a player tracker works, are invisible to extraction.

- Declare every playback event (`video.started`, `video.progress`, `video.threshold`, `video.ended`, `video.completed`, `video.summary`, `video.error`, …) in `app-manifest.json` → `track-events` by hand, or merge the docs guide's `track-events.json`.
- Re-check `track-events` after renaming an event. Re-running extraction will not catch it.
- Keep IDs in properties (`post_id`, `view_id`), not in event names.
