import { createApp } from "vue";
import App from "./App.vue";
import "@gramercytech/gx-componentkit/style.css";

import * as Vue from "vue";
import { useGxpStore, pinia } from "./src/stores/index.js";
window.useGxpStore = useGxpStore;
window.Vue = Vue;

const app = createApp(App);
app.use(pinia);
app.mount("#app");
