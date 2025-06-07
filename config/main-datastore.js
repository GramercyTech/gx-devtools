import { createApp } from "vue";
import App from "./App.vue";
import "@gramercytech/gx-componentkit/dist/gx-componentkit.css";
import { pinia } from "./src/store/index.js";
import * as Vue from "vue";

window.Vue = Vue;

const app = createApp(App);
app.use(pinia);
app.mount("#app");
