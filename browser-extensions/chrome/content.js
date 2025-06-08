// JavaScript Proxy Extension Content Script
// This extension handles redirects at the network level via webRequest/declarativeNetRequest APIs
// Content script is mainly used for cache clearing and debugging
(function () {
	let isProxyEnabled = false;
	let config = {};

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

	// Listen for state changes from background script
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (message.action === "configUpdate") {
			isProxyEnabled = message.config.enabled;
			config = message.config;
			console.log("[JavaScript Proxy Content] Config updated:", config);
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
