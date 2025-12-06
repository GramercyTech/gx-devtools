import { createPinia } from "pinia";

// Import from package runtime directory by default
// If you need to customize gxpPortalConfigStore.js, run: gxtk publish gxpPortalConfigStore.js
// Then update this import to: import { useGxpStore } from './gxpPortalConfigStore.js';
import { useGxpStore } from "@gramercytech/gx-toolkit/runtime/stores/gxpPortalConfigStore";

export const pinia = createPinia();

// Expose to window for platform compatibility and externalized imports in src/
// This must happen before any components that use the externalized import are loaded
window.useGxpStore = useGxpStore;

export { useGxpStore };
export default pinia;
