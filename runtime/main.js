import { createApp } from "vue";

import * as Vue from "vue";
import { useGxpStore, pinia } from "@/stores/index.js";
import { createGxpStringsPlugin } from "@gx-runtime/gxpStringsPlugin.js";

// Expose Vue and store to window for browser console access and platform compatibility
window.useGxpStore = useGxpStore;
window.Vue = Vue;
window.pinia = pinia;

// Import PortalContainer from the toolkit's runtime
import App from "@gx-runtime/PortalContainer.vue";

const app = createApp(App);
app.use(pinia);

// Initialize the GxP store and register the strings plugin
const gxpStore = useGxpStore();
app.use(createGxpStringsPlugin(gxpStore));

app.mount("#app");
