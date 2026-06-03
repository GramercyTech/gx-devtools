import { createApp } from "vue"
import * as Vue from "vue"
import * as Pinia from "pinia"
import { createPinia, setActivePinia } from "pinia"

// Create and configure Pinia before any store imports
const pinia = createPinia()
setActivePinia(pinia)

// Expose Vue and Pinia to window for dynamically loaded plugins
window.Vue = Vue
window.Pinia = Pinia
window.pinia = pinia

// Dynamic imports ensure pinia is set up before stores load
async function init() {
	const { default: App } = await import("@gx-runtime/PortalContainer.vue")
	const { useGxpStore } = await import("@/stores/index.js")
	const { createGxpStringsPlugin } =
		await import("@gx-runtime/gxpStringsPlugin.js")
	const { createGxpAnalyticsPlugin } =
		await import("@gx-runtime/gxpAnalyticsPlugin.js")

	window.useGxpStore = useGxpStore

	const app = createApp(App)
	app.use(pinia)

	const gxpStore = useGxpStore()

	// Build the dev server base URL so gxp-src default paths resolve to the
	// local dev server instead of the current domain (important when the app
	// is injected into the cloud platform via browser extension).
	const devProtocol =
		import.meta.env.VITE_USE_HTTPS !== "false" ? "https" : "http"
	const devPort = import.meta.env.VITE_NODE_PORT || "3060"
	const devServerBaseUrl = `${devProtocol}://localhost:${devPort}`

	app.use(createGxpStringsPlugin(gxpStore, { devServerBaseUrl }))

	// Dev analytics: same gxp-track / window.gxp.track API as the platform,
	// but events are broadcast on window + logged to the console instead of
	// being sent to the production tracking endpoint.
	if (import.meta.env.VITE_DISABLE_ANALYTICS !== "true") {
		app.use(
			createGxpAnalyticsPlugin({
				projectId: import.meta.env.VITE_API_PROJECT_ID || null,
			}),
		)
	}

	app.mount("#app")
}

init()
