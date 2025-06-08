import { createApp } from "vue";
import App from "./App.vue";
import "@gramercytech/gx-componentkit/style.css";

import { pinia } from "./src/stores/index.js";
import * as Vue from "vue";

window.Vue = Vue;

const app = createApp(App);
app.use(pinia);
app.mount("#app");
