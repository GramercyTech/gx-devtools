import { createApp } from "vue";
import App from "./App.vue";
import "@gramercytech/gx-componentkit/style.css";

import * as Vue from "vue";

window.Vue = Vue;

const app = createApp(App);
app.mount("#app");
