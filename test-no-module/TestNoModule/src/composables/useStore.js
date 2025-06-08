// Store wrapper that checks for global store and falls back to local
import { useGxpStore as localStore } from "@/stores/gxpPortalConfigStore";

export function useStore() {
	// Check if global store exists on window
	if (typeof window !== "undefined" && window.useGxpStore) {
		console.log("Using global store from parent app");
		return window.useGxpStore();
	} else {
		console.log("Using local store instance");
		return localStore();
	}
}

// Export the local store directly for cases where you specifically need it
export { useGxpStore } from "@/stores/gxpPortalConfigStore";
