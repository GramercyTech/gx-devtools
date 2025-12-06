import { createApp } from "vue";

// Import PortalContainer from the toolkit's runtime (not copied to projects)
// This is resolved via the @gx-runtime alias in vite.config.js
import App from "@gx-runtime/PortalContainer.vue";

import * as Vue from "vue";
import { useGxpStore, pinia } from "@/stores/index.js";

// Expose Vue and store to window for browser console access and platform compatibility
window.useGxpStore = useGxpStore;
window.Vue = Vue;
window.pinia = pinia;

const app = createApp(App);
app.use(pinia);
app.mount("#app");
