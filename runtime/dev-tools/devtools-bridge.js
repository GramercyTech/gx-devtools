/**
 * GxP DevTools Bridge
 *
 * Lets a host page (e.g. the GXP platform's own dev session) drive the in-page
 * dev tools over postMessage instead of through the injected floating menu.
 *
 * When the plugin runs inside an iframe, the floating circle/ribbon is hidden
 * and the platform's own menu issues commands here; all the underlying
 * functionality (inspector modes, layout switching, store access, source edits)
 * runs exactly as the local menu would.
 *
 * Protocol
 * --------
 * Host → plugin (command):
 *   { source: "gxp-host", type: "command", id, action, payload }
 * Plugin → host (response):
 *   { source: "gxp-devtools", type: "response", id, ok, result?, error? }
 * Plugin → host (unsolicited event):
 *   { source: "gxp-devtools", type: "event", event, payload }
 *
 * `win` is injectable so the protocol can be unit-tested without a real window.
 */

const HOST_SOURCE = "gxp-host"
const SELF_SOURCE = "gxp-devtools"

function defaultWindow() {
	return typeof window !== "undefined" ? window : undefined
}

/**
 * Determine whether the plugin is running embedded in a host page.
 * Primary signal is iframe detection (self !== top). A `?gxp-embedded=0|1`
 * query param can force the result for local testing.
 */
export function isEmbedded(win = defaultWindow()) {
	if (!win) {
		return false
	}
	try {
		if (win.location && typeof win.location.search === "string") {
			const value = new URLSearchParams(win.location.search).get("gxp-embedded")
			if (value === "1" || value === "true") {
				return true
			}
			if (value === "0" || value === "false") {
				return false
			}
		}
	} catch {
		/* ignore */
	}
	try {
		return win.self !== win.top
	} catch {
		// Cross-origin access to win.top throws — that only happens inside an iframe.
		return true
	}
}

/**
 * Create the command bridge.
 *
 * @param {object} options
 * @param {Record<string, (payload: any) => any>} options.handlers - action handlers
 * @param {string} [options.targetOrigin="*"] - postMessage target origin
 * @param {Window} [options.win] - injectable window (defaults to global window)
 */
export function createDevtoolsBridge(options = {}) {
	const { handlers = {}, targetOrigin = "*", win = defaultWindow() } = options

	if (!win) {
		return { emit() {}, destroy() {} }
	}

	function post(message) {
		const full = { source: SELF_SOURCE, ...message }
		try {
			if (win.parent && win.parent !== win) {
				win.parent.postMessage(full, targetOrigin)
			}
		} catch {
			/* cross-origin parent can throw */
		}
		try {
			win.postMessage(full, targetOrigin)
		} catch {
			/* ignore */
		}
	}

	function emit(event, payload) {
		post({ type: "event", event, payload })
	}

	async function onMessage(e) {
		const data = e && e.data
		if (!data || data.source !== HOST_SOURCE || data.type !== "command") {
			return
		}
		const { id, action, payload } = data
		const handler = handlers[action]
		if (typeof handler !== "function") {
			post({
				type: "response",
				id,
				ok: false,
				error: `Unknown action: ${action}`,
			})
			return
		}
		try {
			const result = await handler(payload)
			post({ type: "response", id, ok: true, result })
		} catch (err) {
			post({
				type: "response",
				id,
				ok: false,
				error: (err && err.message) || String(err),
			})
		}
	}

	win.addEventListener("message", onMessage)

	// Announce availability and the supported action set so the host can
	// discover capabilities without hardcoding them.
	emit("ready", { actions: Object.keys(handlers) })

	return {
		emit,
		destroy() {
			win.removeEventListener("message", onMessage)
		},
	}
}
