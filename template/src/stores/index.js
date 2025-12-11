// Import from package runtime directory by default
// To customize, run: gxdev publish gxpPortalConfigStore.js
// Then update this import to: import { useGxpStore } from './gxpPortalConfigStore.js';
import { useGxpStore } from "@gxp-dev/tools/runtime/stores/gxpPortalConfigStore";

// Expose to window for platform compatibility and externalized imports
window.useGxpStore = useGxpStore;

export { useGxpStore };
