import { createPinia } from "pinia";

// Import from package by default
// If you need to customize gxpPortalConfigStore.js, run: gxto publish gxpPortalConfigStore.js
// Then update this import to: import { useGxpStore } from './gxpPortalConfigStore.js';
import { useGxpStore } from "@gramercytech/gx-toolkit/config/Store/gxpPortalConfigStore.js";

export const pinia = createPinia();
export { useGxpStore };
export default pinia;
