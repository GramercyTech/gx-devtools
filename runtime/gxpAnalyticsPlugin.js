/**
 * GxP Analytics Plugin for Vue 3 — dev-server version
 *
 * Mirrors the platform's gxpAnalyticsPlugin (gxp-track directive,
 * window.gxp.track(), gxpTrack injection) so plugins can wire up analytics
 * during development with the exact same API they'll have in production.
 *
 * DEV TRANSPORT: unlike the platform version (which POSTs events to the
 * production tracking endpoint via navigator.sendBeacon), this version never
 * touches the network. Every event is broadcast on `window` as a
 * `gxp:track` CustomEvent (payload in `event.detail`) and logged to the
 * console as JSON, so you can verify exactly what would be sent.
 *
 * Usage:
 *   // Auto-installed by the dev harness (runtime/main.js).
 *
 *   // Declarative click tracking from any template:
 *   <button gxp-track="registration.submit">Submit</button>
 *   <button gxp-track="cta.clicked" gxp-track-props='{"placement":"hero"}'>Go</button>
 *
 *   // Custom event from any JS context:
 *   window.gxp.track('registration.started', { form_id: 123 })
 *
 *   // Observe events programmatically (e.g. in tests):
 *   window.addEventListener('gxp:track', (e) => console.log(e.detail))
 */

export const GXP_TRACK_WINDOW_EVENT = "gxp:track"

/**
 * Create the analytics plugin.
 *
 * @param {Object} options
 * @param {number|string|null} options.projectId - GXP project ID (injected from server)
 */
export function createGxpAnalyticsPlugin(options = {}) {
	return {
		install(app) {
			const projectId = options.projectId || window.__gxp_project_id || null

			// Expose window.gxp.track() for custom events
			window.gxp = window.gxp || {}
			window.gxp.track = (eventName, properties = {}) => {
				sendEvent({
					event_type: "custom",
					event_name: eventName,
					project_id: projectId,
					properties,
				})
			}

			// Make track available via Vue injection too
			app.provide("gxpTrack", window.gxp.track)

			// Register v-gxp-track directive for declarative click tracking
			app.directive("gxp-track", {
				mounted(el, binding) {
					setupTrackElement(el, binding, projectId)
				},
				updated(el, binding) {
					// Re-bind if the identifier changes
					if (el._gxpTrackId !== resolveTrackId(binding)) {
						cleanupTrackElement(el)
						setupTrackElement(el, binding, projectId)
					}
				},
				unmounted(el) {
					cleanupTrackElement(el)
				},
			})

			// Global listener for raw gxp-track attributes (without v- prefix)
			// Handles elements rendered by external plugins or server-side HTML
			initAttributeListener(projectId)

			// Dev-only: log every broadcast event to the console as JSON
			initDevConsoleLogger()
		},
	}
}

/**
 * Resolve the track identifier from a directive binding or element attribute.
 */
function resolveTrackId(binding) {
	return binding.value || binding.arg || null
}

/**
 * Set up click tracking on a directive-bound element.
 */
function setupTrackElement(el, binding, projectId) {
	const trackId = resolveTrackId(binding)
	if (!trackId) return

	el._gxpTrackId = trackId
	el._gxpTrackHandler = () => {
		const props = parseTrackProps(el)
		sendEvent({
			event_type: "interaction",
			event_name: trackId,
			project_id: projectId,
			properties: {
				element_tag: el.tagName?.toLowerCase(),
				element_text: (el.textContent || "").trim().slice(0, 100),
				...props,
			},
		})
	}
	el.addEventListener("click", el._gxpTrackHandler)
}

/**
 * Remove the click listener from an element.
 */
function cleanupTrackElement(el) {
	if (el._gxpTrackHandler) {
		el.removeEventListener("click", el._gxpTrackHandler)
		delete el._gxpTrackHandler
		delete el._gxpTrackId
	}
}

/**
 * Parse optional gxp-track-props attribute as JSON.
 */
function parseTrackProps(el) {
	const raw = el.getAttribute("gxp-track-props")
	if (!raw) return {}
	try {
		return JSON.parse(raw)
	} catch {
		return {}
	}
}

/**
 * Global delegated click listener for raw gxp-track attributes.
 *
 * This handles elements that use the raw HTML attribute (without v- prefix),
 * such as server-rendered HTML or external plugin content.
 */
function initAttributeListener(projectId) {
	if (window._gxpTrackListenerActive) return
	window._gxpTrackListenerActive = true

	document.addEventListener(
		"click",
		(event) => {
			// Walk up from the click target to find the nearest gxp-track element
			const el = event.target?.closest?.("[gxp-track]")
			if (!el) return

			// Skip if this element is already handled by the Vue directive
			if (el._gxpTrackHandler) return

			const trackId = el.getAttribute("gxp-track")
			if (!trackId) return

			const props = parseTrackProps(el)
			sendEvent({
				event_type: "interaction",
				event_name: trackId,
				project_id: projectId,
				properties: {
					element_tag: el.tagName?.toLowerCase(),
					element_text: (el.textContent || "").trim().slice(0, 100),
					...props,
				},
			})
		},
		{ capture: false, passive: true },
	)
}

/**
 * Dev-only console logger: subscribes to the window broadcast and prints
 * every event payload as pretty JSON so developers can see exactly what
 * the production plugin would send to the tracking endpoint.
 */
function initDevConsoleLogger() {
	if (window._gxpTrackLoggerActive) return
	window._gxpTrackLoggerActive = true

	window.addEventListener(GXP_TRACK_WINDOW_EVENT, (event) => {
		console.log(
			"[GxP Analytics] track event:\n" + JSON.stringify(event.detail, null, 2),
		)
	})
}

/**
 * Broadcast an analytics event on the window (dev transport).
 *
 * The production plugin sends the same payload to the tracking endpoint via
 * navigator.sendBeacon / fetch — in the dev harness we dispatch a
 * `gxp:track` CustomEvent instead so nothing hits production analytics.
 *
 * @param {Object} payload
 */
function sendEvent(payload) {
	try {
		window.dispatchEvent(
			new CustomEvent(GXP_TRACK_WINDOW_EVENT, { detail: payload }),
		)
	} catch {
		// Swallow all errors — analytics must never break the app
	}
}

export default createGxpAnalyticsPlugin
