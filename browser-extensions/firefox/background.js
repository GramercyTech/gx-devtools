// Extension state
let isProxyEnabled = false;
let proxyRules = [];
let notificationTimeouts = new Map();

// Default proxy rules
const defaultRules = [
	{
		pattern: "api\\.example\\.com",
		redirect: "api.alternative.com",
		maskUrl: false, // Set to true for URL masking instead of redirect
	},
];

// Proxy mode setting
let useMasking = false; // Toggle between redirect and masking modes

// Initialize extension
browser.runtime.onStartup.addListener(initializeExtension);
browser.runtime.onInstalled.addListener(initializeExtension);

async function initializeExtension() {
	console.log("[Traffic Proxy] Initializing extension...");
	try {
		// Load saved state
		const result = await browser.storage.local.get([
			"proxyEnabled",
			"proxyRules",
			"useMasking",
		]);
		isProxyEnabled = result.proxyEnabled || false;
		proxyRules = result.proxyRules || defaultRules;
		useMasking = result.useMasking || false;

		console.log("[Traffic Proxy] Loaded state:", {
			enabled: isProxyEnabled,
			ruleCount: proxyRules.length,
		});

		updateIcon();
		updateRequestListener();

		console.log("[Traffic Proxy] Extension initialized successfully");
	} catch (error) {
		console.error("[Traffic Proxy] Failed to initialize:", error);
	}
}

// Update toolbar icon based on state
function updateIcon() {
	const iconPath = isProxyEnabled ? "icons/gx_on" : "icons/gx_off";
	browser.browserAction.setIcon({
		path: {
			16: `${iconPath}_16.png`,
			32: `${iconPath}_32.png`,
			48: `${iconPath}_48.png`,
			128: `${iconPath}_128.png`,
		},
	});

	const title = isProxyEnabled ? "Traffic Proxy (ON)" : "Traffic Proxy (OFF)";
	browser.browserAction.setTitle({ title });
}

// Handle web requests
function handleRequest(details) {
	console.log("handleRequest", details);
	if (!isProxyEnabled) return {};

	// Skip certain request types that commonly cause issues
	const skipTypes = ["ping", "csp_report", "beacon"];
	if (skipTypes.includes(details.type)) {
		return {};
	}

	// Skip data URLs and blob URLs
	if (
		details.url.startsWith("data:") ||
		details.url.startsWith("blob:") ||
		details.url.startsWith("chrome:") ||
		details.url.startsWith("moz-extension:")
	) {
		return {};
	}

	let url;
	try {
		url = new URL(details.url);
	} catch (error) {
		console.log(`[Traffic Proxy] Invalid URL: ${details.url}`);
		return {};
	}

	const originalHost = url.hostname;

	for (const rule of proxyRules) {
		const regex = new RegExp(rule.pattern, "i");
		// Test against both hostname and full URL for flexibility
		const matchesHost = regex.test(originalHost);
		const matchesFullUrl = regex.test(details.url);

		// Prevent redirect loops - don't redirect if already going to target
		if (originalHost === rule.redirect) {
			console.log(
				`[Traffic Proxy] Skipping redirect loop: ${originalHost} already matches target ${rule.redirect}`
			);
			continue;
		}

		if (matchesHost || matchesFullUrl) {
			const newUrl = details.url.replace(originalHost, rule.redirect);
			const requestType = getRequestTypeDescription(details.type);

			// Additional loop prevention - check if new URL would match any pattern
			const wouldCreateLoop = proxyRules.some((r) => {
				const testRegex = new RegExp(r.pattern, "i");
				return testRegex.test(rule.redirect) || testRegex.test(newUrl);
			});

			if (wouldCreateLoop) {
				console.log(
					`[Traffic Proxy] Preventing redirect loop: ${details.url} → ${newUrl} would match another rule`
				);
				continue;
			}

			// Check if this rule should use URL masking
			if (rule.maskUrl || useMasking) {
				// Store original URL for header modification
				storeOriginalUrl(details.requestId, details.url, rule.redirect);

				console.log(
					`[Traffic Proxy] Masking ${details.type}: ${details.url} (routing to ${rule.redirect})`
				);

				// Don't redirect - we'll modify headers instead
				return {};
			} else {
				// Traditional redirect approach
				showProxyNotification(originalHost, rule.redirect, requestType);

				console.log(
					`[Traffic Proxy] Redirecting ${details.type}: ${details.url} → ${newUrl}`
				);

				return { redirectUrl: newUrl };
			}
		}
	}

	return {};
}

// Store mapping of request IDs to proxy info for header modification
const pendingProxyRequests = new Map();

function storeOriginalUrl(requestId, originalUrl, proxyHost) {
	pendingProxyRequests.set(requestId, {
		originalUrl,
		proxyHost,
		timestamp: Date.now(),
	});

	// Clean up old entries after 30 seconds
	setTimeout(() => {
		pendingProxyRequests.delete(requestId);
	}, 30000);
}

// Get human-readable description of request type
function getRequestTypeDescription(type) {
	const typeMap = {
		script: "JavaScript/Module",
		main_frame: "Page",
		sub_frame: "Frame",
		stylesheet: "CSS",
		image: "Image",
		font: "Font",
		object: "Plugin",
		xmlhttprequest: "XHR",
		ping: "Ping",
		csp_report: "CSP Report",
		media: "Media",
		websocket: "WebSocket",
		other: "Other",
	};
	return typeMap[type] || type;
}

// Show proxy notification
function showProxyNotification(from, to, requestType = "") {
	const notificationId = `proxy-${Date.now()}`;
	const typeText = requestType ? ` (${requestType})` : "";

	browser.notifications.create(notificationId, {
		type: "basic",
		iconUrl: "icons/gx_on_48.png",
		title: "Traffic Proxied",
		message: `${from} → ${to}${typeText}`,
	});

	// Auto-close notification after 3 seconds
	setTimeout(() => {
		browser.notifications.clear(notificationId);
	}, 3000);
}

// Handle request headers for URL masking
function handleRequestHeaders(details) {
	const proxyInfo = pendingProxyRequests.get(details.requestId);
	if (!proxyInfo) return {};

	console.log(
		`[Traffic Proxy] Modifying headers for masked request: ${details.url}`
	);

	try {
		const headers = details.requestHeaders || [];

		// Add custom headers to route request through proxy
		headers.push({
			name: "X-Proxy-Original-Host",
			value: new URL(proxyInfo.originalUrl).hostname,
		});

		headers.push({
			name: "X-Proxy-Original-URL",
			value: proxyInfo.originalUrl,
		});

		// Modify Host header to point to proxy
		const hostHeader = headers.find((h) => h.name.toLowerCase() === "host");
		if (hostHeader) {
			hostHeader.value = proxyInfo.proxyHost;
		} else {
			headers.push({
				name: "Host",
				value: proxyInfo.proxyHost,
			});
		}

		// Add CORS headers to prevent issues
		headers.push({
			name: "Access-Control-Allow-Origin",
			value: "*",
		});

		// Show notification for masked request
		const requestType = getRequestTypeDescription(details.type);
		showProxyNotification(
			new URL(proxyInfo.originalUrl).hostname,
			proxyInfo.proxyHost,
			requestType + " (Masked)"
		);

		return { requestHeaders: headers };
	} catch (error) {
		console.error(`[Traffic Proxy] Error modifying headers:`, error);
		return {};
	}
}

// Handle response headers to fix CORS and content issues
function handleResponseHeaders(details) {
	const proxyInfo = pendingProxyRequests.get(details.requestId);
	if (!proxyInfo) return {};

	try {
		const headers = details.responseHeaders || [];

		// Remove problematic headers that might cause corruption
		const headersToRemove = [
			"content-security-policy",
			"x-frame-options",
			"content-encoding",
		];
		const filteredHeaders = headers.filter(
			(header) => !headersToRemove.includes(header.name.toLowerCase())
		);

		// Add/modify CORS headers
		const corsHeaders = [
			{ name: "Access-Control-Allow-Origin", value: "*" },
			{
				name: "Access-Control-Allow-Methods",
				value: "GET, POST, PUT, DELETE, OPTIONS",
			},
			{ name: "Access-Control-Allow-Headers", value: "*" },
		];

		corsHeaders.forEach((corsHeader) => {
			const existingHeader = filteredHeaders.find(
				(h) => h.name.toLowerCase() === corsHeader.name.toLowerCase()
			);
			if (existingHeader) {
				existingHeader.value = corsHeader.value;
			} else {
				filteredHeaders.push(corsHeader);
			}
		});

		console.log(
			`[Traffic Proxy] Modified response headers for: ${details.url}`
		);
		return { responseHeaders: filteredHeaders };
	} catch (error) {
		console.error(`[Traffic Proxy] Error modifying response headers:`, error);
		return {};
	}
}

// Update request listener based on proxy state
function updateRequestListener() {
	// Remove existing listeners
	if (browser.webRequest.onBeforeRequest.hasListener(handleRequest)) {
		browser.webRequest.onBeforeRequest.removeListener(handleRequest);
		console.log("[Traffic Proxy] Removed webRequest listener");
	}

	if (
		browser.webRequest.onBeforeSendHeaders.hasListener(handleRequestHeaders)
	) {
		browser.webRequest.onBeforeSendHeaders.removeListener(handleRequestHeaders);
		console.log("[Traffic Proxy] Removed header modification listener");
	}

	if (browser.webRequest.onHeadersReceived.hasListener(handleResponseHeaders)) {
		browser.webRequest.onHeadersReceived.removeListener(handleResponseHeaders);
		console.log("[Traffic Proxy] Removed response header listener");
	}

	if (isProxyEnabled) {
		try {
			// Add request interceptor
			browser.webRequest.onBeforeRequest.addListener(
				handleRequest,
				{ urls: ["<all_urls>"] },
				["blocking"]
			);

			// Add header modifier for URL masking
			browser.webRequest.onBeforeSendHeaders.addListener(
				handleRequestHeaders,
				{ urls: ["<all_urls>"] },
				["blocking", "requestHeaders"]
			);

			// Add response header handler to fix CORS issues
			browser.webRequest.onHeadersReceived.addListener(
				handleResponseHeaders,
				{ urls: ["<all_urls>"] },
				["blocking", "responseHeaders"]
			);

			console.log("[Traffic Proxy] Added webRequest listeners - proxy enabled");
		} catch (error) {
			console.error(
				"[Traffic Proxy] Failed to add webRequest listeners:",
				error
			);
		}
	} else {
		console.log("[Traffic Proxy] Proxy disabled - no listeners added");
	}
}

// Handle messages from popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
	switch (message.action) {
		case "toggleProxy":
			isProxyEnabled = !isProxyEnabled;
			browser.storage.local.set({ proxyEnabled: isProxyEnabled });
			updateIcon();
			updateRequestListener();
			sendResponse({ enabled: isProxyEnabled });
			break;

		case "getState":
			sendResponse({
				enabled: isProxyEnabled,
				rules: proxyRules,
			});
			break;

		case "updateRules":
			proxyRules = message.rules;
			browser.storage.local.set({ proxyRules: proxyRules });
			sendResponse({ success: true });
			break;

		case "setMaskingMode":
			useMasking = message.enabled;
			browser.storage.local.set({ useMasking: useMasking });
			console.log(
				`[Traffic Proxy] Masking mode: ${useMasking ? "enabled" : "disabled"}`
			);
			sendResponse({ success: true });
			break;

		default:
			sendResponse({ error: "Unknown action" });
	}

	return true; // Keep message channel open for async response
});
