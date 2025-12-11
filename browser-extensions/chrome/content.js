// JavaScript Proxy Extension Content Script
// This extension handles redirects at the network level via webRequest/declarativeNetRequest APIs
// Content script is mainly used for cache clearing, debugging, and inspector communication
(function () {
	let isProxyEnabled = false;
	let config = {};
	let inspectorEnabled = false;

	// Get initial state from background script
	chrome.runtime
		.sendMessage({ action: "getConfig" })
		.then((response) => {
			isProxyEnabled = response.enabled;
			config = response;
			console.log("[JavaScript Proxy Content] Extension state loaded:", {
				enabled: isProxyEnabled,
				pattern: config.urlPattern,
				redirectUrl: config.redirectUrl,
				url: window.location.href,
			});
		})
		.catch((err) =>
			console.error(
				"[JavaScript Proxy Content] Failed to get extension config:",
				err
			)
		);

	// Listen for messages from popup/background
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (message.action === "configUpdate") {
			isProxyEnabled = message.config.enabled;
			config = message.config;
			console.log("[JavaScript Proxy Content] Config updated:", config);
		}

		// Inspector toggle request from popup
		if (message.action === "toggleInspector") {
			// Relay to page context via postMessage
			window.postMessage({ type: 'GXP_INSPECTOR_ACTION', action: 'toggleInspector' }, '*');
			// Toggle local state
			inspectorEnabled = !inspectorEnabled;
			sendResponse({ enabled: inspectorEnabled });
			return true;
		}

		// Get inspector state request from popup
		if (message.action === "getInspectorState") {
			// Check if inspector is loaded in page
			sendResponse({ enabled: inspectorEnabled });
			return true;
		}
	});

	// Listen for messages from page context (inspector.js)
	window.addEventListener('message', (event) => {
		if (event.source !== window) return;

		// Inspector state updates from page context
		if (event.data?.type === 'GXP_INSPECTOR_STATE') {
			inspectorEnabled = event.data.enabled;
		}
	});

	// Expose proxy state for debugging
	window.jsProxyExtension = {
		isEnabled: () => isProxyEnabled,
		getConfig: () => config,
		debug: () => {
			console.log("[JavaScript Proxy Content] Debug Info:", {
				enabled: isProxyEnabled,
				config: config,
				url: window.location.href,
			});
		},
	};

	console.log("[JavaScript Proxy Content] Content script loaded");
})();
