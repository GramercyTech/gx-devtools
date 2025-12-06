/**
 * GxP Strings Plugin for Vue 3
 *
 * Provides directives for auto-replacement of content from the GxP store:
 *
 * gxp-string - Replace text content with value from stringsList (default)
 *   <h1 gxp-string="welcome_title">Welcome</h1>
 *
 * gxp-string + gxp-settings - Replace text content with value from pluginVars
 *   <span gxp-string="company_name" gxp-settings>Default Company</span>
 *
 * gxp-string + gxp-assets - Replace text content with value from assetList
 *   <span gxp-string="logo_url" gxp-assets>/default/logo.png</span>
 *
 * gxp-string + gxp-state - Replace text content with value from triggerState
 *   <span gxp-string="current_status" gxp-state>idle</span>
 *
 * gxp-src - Replace src attribute with value from assetList (default)
 *   <img gxp-src="hero_image" src="/dev-assets/placeholder.jpg" />
 *
 * gxp-src + gxp-state - Replace src attribute with value from triggerState
 *   <img gxp-src="dynamic_image" gxp-state src="/dev-assets/placeholder.jpg" />
 *
 * The directives will:
 * 1. Store the original value as default
 * 2. Look up the key in the appropriate store
 * 3. Replace content/attribute if a value exists
 * 4. Fall back to the original if no value found
 */

import { watch } from "vue";

/**
 * Create the GxP Strings Plugin
 * @param {Object} store - The GxP Pinia store instance
 * @returns {Object} Vue plugin
 */
export function createGxpStringsPlugin(store) {
	return {
		install(app) {
			// Register the v-gxp-string directive
			app.directive("gxp-string", {
				// Called when the element is mounted
				mounted(el, binding) {
					const key = binding.value || el.getAttribute("gxp-string");
					if (!key) return;

					// Store the original text content as default
					const defaultValue = el.textContent || "";
					el._gxpStringDefault = defaultValue;
					el._gxpStringKey = key;

					// Initial update
					updateElementText(el, key, defaultValue, store);

					// Watch for changes in the appropriate store based on attributes
					// Using deep: true to catch when entire object is replaced (async manifest load)
					if (store) {
						const watchSource = getWatchSource(el, key, store);
						if (watchSource) {
							el._gxpUnwatch = watch(watchSource, () => {
								updateElementText(el, key, defaultValue, store);
							}, { deep: true });
						}
					}
				},

				// Called when binding value changes
				updated(el, binding) {
					const key = binding.value || el.getAttribute("gxp-string");
					if (!key) return;

					const defaultValue = el._gxpStringDefault || el.textContent || "";
					updateElementText(el, key, defaultValue, store);
				},

				// Cleanup when element is unmounted
				unmounted(el) {
					if (el._gxpUnwatch) {
						el._gxpUnwatch();
					}
					delete el._gxpStringDefault;
					delete el._gxpStringKey;
					delete el._gxpUnwatch;
				},
			});

			// Register the v-gxp-src directive for replacing src attributes
			app.directive("gxp-src", {
				// Called when the element is mounted
				mounted(el, binding) {
					const key = binding.value || el.getAttribute("gxp-src");
					if (!key) return;

					// Store the original src as default
					const defaultSrc = el.getAttribute("src") || "";
					el._gxpSrcDefault = defaultSrc;
					el._gxpSrcKey = key;

					// Initial update
					updateElementSrc(el, key, defaultSrc, store);

					// Watch for changes in the appropriate store based on attributes
					// Using deep: true to catch when entire object is replaced (async manifest load)
					if (store) {
						const watchSource = getSrcWatchSource(el, key, store);
						if (watchSource) {
							el._gxpSrcUnwatch = watch(watchSource, () => {
								updateElementSrc(el, key, defaultSrc, store);
							}, { deep: true });
						}
					}
				},

				// Called when binding value changes
				updated(el, binding) {
					const key = binding.value || el.getAttribute("gxp-src");
					if (!key) return;

					const defaultSrc = el._gxpSrcDefault || el.getAttribute("src") || "";
					updateElementSrc(el, key, defaultSrc, store);
				},

				// Cleanup when element is unmounted
				unmounted(el) {
					if (el._gxpSrcUnwatch) {
						el._gxpSrcUnwatch();
					}
					delete el._gxpSrcDefault;
					delete el._gxpSrcKey;
					delete el._gxpSrcUnwatch;
				},
			});

			// Also handle raw gxp-string and gxp-src attributes (without v- prefix)
			// This runs after mount to catch all elements with the attribute
			// We also set up a watcher for manifestLoaded to re-process when manifest loads
			app.mixin({
				mounted() {
					this.$nextTick(() => {
						processGxpStringAttributes(this.$el, store);
						processGxpSrcAttributes(this.$el, store);
					});

					// Watch for manifest loading to re-process attributes
					if (store && store.manifestLoaded !== undefined) {
						const rootEl = this.$el;
						this._gxpManifestUnwatch = watch(
							() => store.manifestLoaded,
							(loaded) => {
								if (loaded) {
									this.$nextTick(() => {
										reprocessGxpStringAttributes(rootEl, store);
										reprocessGxpSrcAttributes(rootEl, store);
									});
								}
							}
						);
					}
				},
				updated() {
					this.$nextTick(() => {
						processGxpStringAttributes(this.$el, store);
						processGxpSrcAttributes(this.$el, store);
					});
				},
				unmounted() {
					if (this._gxpManifestUnwatch) {
						this._gxpManifestUnwatch();
					}
				},
			});
		},
	};
}

/**
 * Get the appropriate watch source for gxp-string based on element attributes
 * We watch for both:
 * 1. The specific key value changing (for DevTools updates)
 * 2. The entire object changing (for manifest loading)
 *
 * By returning the specific value along with the object reference,
 * Vue's watch will trigger when either changes.
 */
function getWatchSource(el, key, store) {
	if (el.hasAttribute("gxp-state") && store.triggerState !== undefined) {
		// Watch specific key AND entire object to catch both types of updates
		return () => ({
			value: store.triggerState?.[key],
			obj: store.triggerState,
			loaded: store.manifestLoaded
		});
	} else if (el.hasAttribute("gxp-settings") && store.pluginVars !== undefined) {
		return () => ({
			value: store.pluginVars?.[key],
			obj: store.pluginVars,
			loaded: store.manifestLoaded
		});
	} else if (el.hasAttribute("gxp-assets") && store.assetList !== undefined) {
		return () => ({
			value: store.assetList?.[key],
			obj: store.assetList,
			loaded: store.manifestLoaded
		});
	} else if (store.stringsList !== undefined) {
		return () => ({
			value: store.stringsList?.[key],
			obj: store.stringsList,
			loaded: store.manifestLoaded
		});
	}
	return null;
}

/**
 * Get the appropriate watch source for gxp-src based on element attributes
 * We watch for both the specific key and the entire object.
 */
function getSrcWatchSource(el, key, store) {
	if (el.hasAttribute("gxp-state") && store.triggerState !== undefined) {
		return () => ({
			value: store.triggerState?.[key],
			obj: store.triggerState,
			loaded: store.manifestLoaded
		});
	} else if (store.assetList !== undefined) {
		return () => ({
			value: store.assetList?.[key],
			obj: store.assetList,
			loaded: store.manifestLoaded
		});
	}
	return null;
}

/**
 * Update element text content based on store value
 */
function updateElementText(el, key, defaultValue, store) {
	if (!store) {
		return;
	}

	let translatedValue;
	if (el.hasAttribute("gxp-state")) {
		translatedValue = store.getState?.(key);
	} else if (el.hasAttribute("gxp-settings")) {
		translatedValue = store.getSetting?.(key);
	} else if (el.hasAttribute("gxp-assets")) {
		translatedValue = store.getAsset?.(key);
	} else {
		translatedValue = store.getString?.(key);
	}

	if (translatedValue && translatedValue !== defaultValue) {
		el.textContent = translatedValue;
	} else {
		el.textContent = defaultValue;
	}
}

/**
 * Update element src attribute based on store value
 * Uses triggerState if gxp-state attribute is present, otherwise assetList
 */
function updateElementSrc(el, key, defaultSrc, store) {
	if (!store) {
		return;
	}

	let srcUrl;
	if (el.hasAttribute("gxp-state")) {
		srcUrl = store.getState?.(key);
	} else {
		srcUrl = store.getAsset?.(key);
	}

	if (srcUrl && srcUrl !== defaultSrc) {
		el.setAttribute("src", srcUrl);
	} else if (defaultSrc) {
		el.setAttribute("src", defaultSrc);
	}
}

/**
 * Process all elements with gxp-string attribute in a subtree
 * This handles elements that use the raw attribute without the v- directive
 */
function processGxpStringAttributes(rootEl, store) {
	if (!rootEl || !store) return;

	// Handle case where rootEl is a text node or comment
	if (!rootEl.querySelectorAll) return;

	const elements = rootEl.querySelectorAll("[gxp-string]");

	elements.forEach((el) => {
		const key = el.getAttribute("gxp-string");
		if (!key) return;

		// Store default value only on first processing
		if (!el._gxpStringDefault) {
			el._gxpStringDefault = el.textContent || "";
		}
		el._gxpStringKey = key;

		// Update text
		updateElementText(el, key, el._gxpStringDefault, store);

		// Set up watcher for this element (if not already watching)
		if (!el._gxpUnwatch) {
			const watchSource = getWatchSource(el, key, store);
			if (watchSource) {
				el._gxpUnwatch = watch(watchSource, () => {
					updateElementText(el, key, el._gxpStringDefault, store);
				}, { deep: true });
			}
		}
	});
}

/**
 * Re-process all elements with gxp-string attribute in a subtree
 * This is called when manifest loads to update elements that were already processed
 */
function reprocessGxpStringAttributes(rootEl, store) {
	if (!rootEl || !store) return;
	if (!rootEl.querySelectorAll) return;

	const elements = rootEl.querySelectorAll("[gxp-string]");

	elements.forEach((el) => {
		const key = el.getAttribute("gxp-string");
		if (!key) return;

		const defaultValue = el._gxpStringDefault || el.textContent || "";
		updateElementText(el, key, defaultValue, store);
	});
}

/**
 * Process all elements with gxp-src attribute in a subtree
 * This handles elements that use the raw attribute without the v- directive
 */
function processGxpSrcAttributes(rootEl, store) {
	if (!rootEl || !store) return;

	// Handle case where rootEl is a text node or comment
	if (!rootEl.querySelectorAll) return;

	const elements = rootEl.querySelectorAll("[gxp-src]");

	elements.forEach((el) => {
		const key = el.getAttribute("gxp-src");
		if (!key) return;

		// Store default value only on first processing
		if (!el._gxpSrcDefault) {
			el._gxpSrcDefault = el.getAttribute("src") || "";
		}
		el._gxpSrcKey = key;

		// Update src
		updateElementSrc(el, key, el._gxpSrcDefault, store);

		// Set up watcher for this element (if not already watching)
		if (!el._gxpSrcUnwatch) {
			const watchSource = getSrcWatchSource(el, key, store);
			if (watchSource) {
				el._gxpSrcUnwatch = watch(watchSource, () => {
					updateElementSrc(el, key, el._gxpSrcDefault, store);
				}, { deep: true });
			}
		}
	});
}

/**
 * Re-process all elements with gxp-src attribute in a subtree
 * This is called when manifest loads to update elements that were already processed
 */
function reprocessGxpSrcAttributes(rootEl, store) {
	if (!rootEl || !store) return;
	if (!rootEl.querySelectorAll) return;

	const elements = rootEl.querySelectorAll("[gxp-src]");

	elements.forEach((el) => {
		const key = el.getAttribute("gxp-src");
		if (!key) return;

		const defaultSrc = el._gxpSrcDefault || el.getAttribute("src") || "";
		updateElementSrc(el, key, defaultSrc, store);
	});
}

/**
 * Standalone function to process gxp-string attributes
 * Can be called manually if needed
 */
export function processGxpStrings(rootElement, store) {
	processGxpStringAttributes(rootElement, store);
}

/**
 * Standalone function to process gxp-src attributes
 * Can be called manually if needed
 */
export function processGxpSrcs(rootElement, store) {
	processGxpSrcAttributes(rootElement, store);
}

/**
 * Get the string key from an element if it has gxp-string attribute
 */
export function getGxpStringKey(element) {
	return element?.getAttribute?.("gxp-string") || null;
}

/**
 * Check if an element has a gxp-string attribute
 */
export function hasGxpString(element) {
	return element?.hasAttribute?.("gxp-string") || false;
}

export default createGxpStringsPlugin;
