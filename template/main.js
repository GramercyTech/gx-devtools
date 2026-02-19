import { createApp } from "vue";
import * as Vue from "vue";
import * as Pinia from "pinia";
import { createPinia, setActivePinia } from "pinia";

// Create and configure Pinia before any store imports
const pinia = createPinia();
setActivePinia(pinia);

// Expose Vue and Pinia to window for dynamically loaded plugins
window.Vue = Vue;
window.Pinia = Pinia;
window.pinia = pinia;

// Dynamic imports ensure pinia is set up before stores load
async function init() {
	const { default: App } = await import("@gx-runtime/PortalContainer.vue");
	const { useGxpStore } = await import("@/stores/index.js");
	const { createGxpStringsPlugin } = await import("@gx-runtime/gxpStringsPlugin.js");

	window.useGxpStore = useGxpStore;

	const app = createApp(App);
	app.use(pinia);

	const gxpStore = useGxpStore();
	app.use(createGxpStringsPlugin(gxpStore));

	app.mount("#app");
}

init();
