# Video playback (HLS / Shaka) and playback analytics

Load this when the plugin plays platform video, such as social stream posts, with Shaka Player or any HLS player, or reports playback analytics.

The full, tested recipe is the docs site's **"Video Playback and Analytics with Shaka"** guide (`docs_search` "Shaka"), with a downloadable `GxpSocialVideo.vue`, `videoAnalytics.mjs`, `signedManifest.mjs` and `track-events.json`. Start from those files instead of writing a player from scratch.

## Use the right fields

- Play `post.file_path_manifest_url`, the HLS master playlist. It is `null` until transcoding finishes, so show a "still processing" state. If it never appears, the upload or transcode failed (see `media-uploads.md`).
- Remount the player (`:key` including the manifest URL) when the post or its manifest URL changes. Don't hot-swap sources in a watcher.

## Signed manifests need the signature on every request

`file_path_manifest_url` is a Google Cloud CDN **URL-prefix** signed URL. Its query (`URLPrefix`, `Expires`, `KeyName`, `Signature`) authorizes every file under the manifest's folder. Shaka resolves variant playlists and segments relative to the manifest, and those requests don't carry the query. Without a request filter, the first child request fails and the video never plays.

Register this filter **before** `player.load()`, and remove it on unmount:

```javascript
/** Parse the signed query and the folder it authorizes. */
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
	const folder = url.pathname.slice(0, url.pathname.lastIndexOf("/") + 1)
	return { query, prefix: url.origin + folder }
}

/** Add the signature only to unsigned requests inside the signed folder. */
export function signUri(uri, signed) {
	if (!signed || !uri || uri.includes("?")) {
		return uri
	}
	let target
	try {
		target = new URL(uri)
	} catch {
		return uri
	}
	return (target.origin + target.pathname).startsWith(signed.prefix)
		? `${uri}?${signed.query}`
		: uri
}

/** Returns a function that removes the filter. */
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

- Scope the signature to the manifest's origin **and folder**. Never append it to other hosts, other posts' folders, or URLs that already have a query.
- Never add GxP API credentials to media requests. Shaka fetching platform-returned CDN URLs is expected; it's not a raw platform API call.
- The signature expires (by default 3,600 minutes after the post was serialized). If playback fails with a network or HTTP error, re-fetch the post through `callApi` and remount with the new URL. Never construct storage URLs.
- Never send the signed URL, or its query, to analytics or logs.

## Playback analytics are not auto-extracted

`config_extract_strings` / `gxdev extract-config` only detect `gxp-track` attributes and `gxp.track("literal.name", …)` / `gxpTrack("literal.name", …)` calls. Events sent through a helper, such as `emit(name)` → `send(name, props)`, which is how a player tracker works, are invisible to extraction.

- Declare every playback event (`video.started`, `video.progress`, `video.threshold`, `video.ended`, `video.completed`, `video.summary`, `video.error`, …) in `app-manifest.json` → `track-events` by hand, or merge the docs guide's `track-events.json`.
- Re-check `track-events` after renaming an event. Re-running extraction will not catch it.
- Keep IDs in properties (`post_id`, `view_id`), not in event names.
