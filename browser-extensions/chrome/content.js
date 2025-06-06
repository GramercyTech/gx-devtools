// Override fetch to intercept requests
(function () {
	const originalFetch = window.fetch;
	let isProxyEnabled = false;
	let proxyRules = [];

	// Get initial state from background script
	chrome.runtime
		.sendMessage({ action: "getState" })
		.then((response) => {
			isProxyEnabled = response.enabled;
			proxyRules = response.rules;
			console.log("[Traffic Proxy Content] State received:", {
				enabled: isProxyEnabled,
				ruleCount: proxyRules.length,
				url: window.location.href,
			});
		})
		.catch((err) =>
			console.error("[Traffic Proxy Content] Failed to get proxy state:", err)
		);

	// Listen for state changes
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (message.action === "stateUpdate") {
			isProxyEnabled = message.enabled;
			proxyRules = message.rules;
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
		try {
			const urlObj = new URL(url);
			const originalHost = urlObj.hostname;

			for (const rule of proxyRules) {
				const regex = new RegExp(rule.pattern, "i");
				if (regex.test(originalHost)) {
					return url.replace(originalHost, rule.redirect);
				}
			}
		} catch (e) {
			// Invalid URL, return as-is
			console.log("Invalid URL for proxy processing:", url);
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

	// Note: Dynamic imports (import('module')) are handled by the background script's declarativeNetRequest API
	// Static imports (import ... from 'module') are also handled by declarativeNetRequest API
	// This content script primarily handles fetch() and XHR calls

	console.log("Traffic Proxy content script loaded");
})();
