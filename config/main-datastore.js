import { createApp } from "vue";
import App from "./App.vue";
import GxUikit from "@gramercytech/gx-componentkit";
import "@gramercytech/gx-componentkit/style.css";
import { pinia } from "./src/store/index.js";
import * as Vue from "vue";

window.Vue = Vue;

const app = createApp(App);
app.use(GxUikit);
app.use(pinia);
app.mount("#app");
