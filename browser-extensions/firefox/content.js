// Override fetch to intercept requests
(function () {
	const originalFetch = window.fetch;
	let isProxyEnabled = false;
	let proxyConfig = {};
	let inspectorEnabled = false;

	// Get initial state from background script
	browser.runtime
		.sendMessage({ action: "getConfig" })
		.then((response) => {
			if (response) {
				isProxyEnabled = response.enabled;
				proxyConfig = response;
				console.log("[Traffic Proxy Content] Config received:", {
					enabled: isProxyEnabled,
					config: proxyConfig,
					url: window.location.href,
				});
			}
		})
		.catch((err) =>
			console.error("[Traffic Proxy Content] Failed to get proxy config:", err)
		);

	// Listen for config changes and inspector messages
	browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (message.action === "configUpdate") {
			isProxyEnabled = message.enabled;
			proxyConfig = message.config;
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

	// Override fetch function
	window.fetch = function (input, init) {
		console.log("fetch", input, init);
		if (!isProxyEnabled) {
			return originalFetch.apply(this, arguments);
		}

		let url = input;
		if (typeof input === "object" && input.url) {
			url = input.url;
		}

		// Apply proxy rules
		const modifiedUrl = applyProxyRules(url);

		// If URL was modified, use the new URL
		if (modifiedUrl !== url) {
			if (typeof input === "string") {
				input = modifiedUrl;
			} else if (typeof input === "object") {
				input = new Request(modifiedUrl, input);
			}
		}

		return originalFetch.apply(this, arguments);
	};

	// Apply proxy rules to URL
	function applyProxyRules(url) {
		if (!proxyConfig || !proxyConfig.rules) {
			return url;
		}

		try {
			// Check each rule type
			for (const [ruleType, rule] of Object.entries(proxyConfig.rules)) {
				if (!rule.enabled || !rule.pattern) continue;

				const regex = new RegExp(rule.pattern, "i");
				if (regex.test(url)) {
					// Handle blank return for CSS
					if (rule.returnBlank) {
						console.log(
							`[Traffic Proxy Content] Returning blank for ${ruleType}: ${url}`
						);
						return ruleType === "css"
							? "data:text/css;charset=utf-8,"
							: "data:text/javascript;charset=utf-8,";
					}

					// Handle redirect
					if (rule.redirectUrl) {
						console.log(
							`[Traffic Proxy Content] Redirecting ${ruleType}: ${url} → ${rule.redirectUrl}`
						);
						return rule.redirectUrl;
					}
				}
			}
		} catch (e) {
			console.log("Error processing URL for proxy rules:", url, e);
		}

		return url;
	}

	// Override XMLHttpRequest as well
	const originalXHROpen = XMLHttpRequest.prototype.open;
	XMLHttpRequest.prototype.open = function (
		method,
		url,
		async,
		user,
		password
	) {
		console.log("open", method, url, async, user, password);
		if (isProxyEnabled) {
			url = applyProxyRules(url);
		}
		return originalXHROpen.call(this, method, url, async, user, password);
	};

	// Note: Dynamic imports (import('module')) are handled by the background script's webRequest API
	// Static imports (import ... from 'module') are also handled by webRequest API
	// This content script primarily handles fetch() and XHR calls

	console.log("Traffic Proxy content script loaded");
})();
