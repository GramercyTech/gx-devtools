import { createApp } from "vue";

import * as Vue from "vue";
import * as Pinia from "pinia";
// Expose Vue, Pinia, and store to window for browser console access and platform compatibility
// This allows dynamically loaded plugins to use the same Vue/Pinia instances
window.Vue = Vue;
window.Pinia = Pinia;


// Import PortalContainer from the toolkit's runtime
import App from "@gx-runtime/PortalContainer.vue";

const app = createApp(App);
app.use(pinia);

import { useGxpStore, pinia } from "@/stores/index.js";
import { createGxpStringsPlugin } from "@gx-runtime/gxpStringsPlugin.js";

// window.pinia = pinia; // The active pinia instance
window.useGxpStore = { useGxpStore };


// Initialize the GxP store and register the strings plugin
const gxpStore = useGxpStore();
app.use(createGxpStringsPlugin(gxpStore));

app.mount("#app");
