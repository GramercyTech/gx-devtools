// Extension state
let config = {
	enabled: false,
	redirectUrl: "https://localhost:3060/src/Plugin.vue",
	urlPattern: "uploads\\/plugin-version\\/\\d+\\/file_name\\/.*\\.js(\\?.*)?",
	useCustomPattern: false,
	maskingMode: false,
};

let notificationTimeouts = new Map();

// Initialize extension
browser.runtime.onStartup.addListener(initializeExtension);
browser.runtime.onInstalled.addListener(initializeExtension);

async function initializeExtension() {
	console.log("[JavaScript Proxy] Initializing extension...");
	try {
		// Load saved configuration
		const defaultConfig = {
			enabled: false,
			redirectUrl: "https://localhost:3060/src/Plugin.vue",
			urlPattern:
				"uploads\\/plugin-version\\/\\d+\\/file_name\\/.*\\.js(\\?.*)?",
			useCustomPattern: false,
			maskingMode: false,
		};

		const result = await browser.storage.sync.get(defaultConfig);
		config = result;

		console.log("[JavaScript Proxy] Loaded configuration:", config);

		updateIcon();
		updateRequestListener();

		console.log("[JavaScript Proxy] Extension initialized successfully");
	} catch (error) {
		console.error("[JavaScript Proxy] Failed to initialize:", error);
	}
}

// Update toolbar icon based on state
function updateIcon() {
	const iconPath = config.enabled ? "icons/gx_on" : "icons/gx_off";
	browser.browserAction.setIcon({
		path: {
			16: `${iconPath}_16.png`,
			32: `${iconPath}_32.png`,
			48: `${iconPath}_48.png`,
			128: `${iconPath}_128.png`,
		},
	});

	const title = config.enabled
		? "JavaScript Proxy (ON)"
		: "JavaScript Proxy (OFF)";
	browser.browserAction.setTitle({ title });
}

// Handle web requests
function handleRequest(details) {
	if (!config.enabled) return {};

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

	// Only process JavaScript files (script type)
	if (details.type !== "script") {
		return {};
	}

	try {
		const regex = new RegExp(config.urlPattern, "i");

		// Test the full URL against the pattern
		if (regex.test(details.url)) {
			let newUrl = config.redirectUrl;

			// Ensure URL has protocol
			if (!newUrl.includes("://")) {
				newUrl = "https://" + newUrl;
			}

			const requestType = getRequestTypeDescription(details.type);

			// Check if this would create a redirect loop
			if (details.url === newUrl || details.url.includes("localhost")) {
				console.log(
					`[JavaScript Proxy] Skipping redirect loop: ${details.url}`
				);
				return {};
			}

			// Check if this rule should use URL masking
			if (config.maskingMode) {
				// Store original URL for header modification
				storeOriginalUrl(details.requestId, details.url, newUrl);

				console.log(
					`[JavaScript Proxy] Masking ${details.type}: ${details.url} (routing to ${newUrl})`
				);

				// Don't redirect - we'll modify headers instead
				return {};
			} else {
				// Traditional redirect approach
				showProxyNotification(details.url, newUrl, requestType);

				console.log(
					`[JavaScript Proxy] Redirecting ${details.type}: ${details.url} → ${newUrl}`
				);

				return { redirectUrl: newUrl };
			}
		}
	} catch (error) {
		console.error("[JavaScript Proxy] Error processing request:", error);
	}

	return {};
}

// Store mapping of request IDs to proxy info for header modification
const pendingProxyRequests = new Map();

function storeOriginalUrl(requestId, originalUrl, redirectUrl) {
	pendingProxyRequests.set(requestId, {
		originalUrl,
		redirectUrl,
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
		script: "JavaScript",
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

// Show desktop notification for proxy activity
function showProxyNotification(from, to, requestType = "") {
	const shortFrom = from.length > 50 ? from.substring(0, 47) + "..." : from;
	const shortTo = to.length > 30 ? to.substring(0, 27) + "..." : to;

	const notificationId = `proxy-${Date.now()}`;

	browser.notifications.create(notificationId, {
		type: "basic",
		iconUrl: "icons/gx_on_48.png",
		title: "JavaScript Proxy Active",
		message: `${requestType}\n${shortFrom}\n→ ${shortTo}`,
	});

	// Clear existing timeout for this type
	if (notificationTimeouts.has("proxy")) {
		clearTimeout(notificationTimeouts.get("proxy"));
	}

	// Auto-dismiss after 3 seconds
	const timeoutId = setTimeout(() => {
		browser.notifications.clear(notificationId);
		notificationTimeouts.delete("proxy");
	}, 3000);

	notificationTimeouts.set("proxy", timeoutId);
}

// Handle request headers for masking mode
function handleRequestHeaders(details) {
	if (!config.enabled || !config.maskingMode) return {};

	const proxyInfo = pendingProxyRequests.get(details.requestId);
	if (!proxyInfo) return {};

	// Modify the request to go to the proxy target
	// This is a simplified approach - you might need more sophisticated header handling
	const modifications = { requestHeaders: details.requestHeaders };

	// Add/modify headers to properly route to localhost
	const hostHeader = modifications.requestHeaders.find(
		(h) => h.name.toLowerCase() === "host"
	);
	if (hostHeader) {
		try {
			const proxyUrl = new URL(proxyInfo.redirectUrl);
			hostHeader.value = proxyUrl.host;
		} catch (error) {
			console.error("[JavaScript Proxy] Error parsing proxy URL:", error);
		}
	}

	return modifications;
}

// Handle response headers for masking mode
function handleResponseHeaders(details) {
	if (!config.enabled || !config.maskingMode) return {};

	const proxyInfo = pendingProxyRequests.get(details.requestId);
	if (!proxyInfo) return {};

	// Modify response headers to maintain the illusion
	const modifications = { responseHeaders: details.responseHeaders };

	// Add CORS headers if needed
	const corsHeaders = [
		{ name: "Access-Control-Allow-Origin", value: "*" },
		{
			name: "Access-Control-Allow-Methods",
			value: "GET, POST, PUT, DELETE, OPTIONS",
		},
		{
			name: "Access-Control-Allow-Headers",
			value: "Content-Type, Authorization",
		},
	];

	corsHeaders.forEach((corsHeader) => {
		const existingHeader = modifications.responseHeaders.find(
			(h) => h.name.toLowerCase() === corsHeader.name.toLowerCase()
		);
		if (existingHeader) {
			existingHeader.value = corsHeader.value;
		} else {
			modifications.responseHeaders.push(corsHeader);
		}
	});

	console.log(
		`[JavaScript Proxy] Modified response headers for: ${details.url}`
	);
	return modifications;
}

// Update request listener based on current state
function updateRequestListener() {
	// Remove existing listeners
	if (browser.webRequest.onBeforeRequest.hasListener(handleRequest)) {
		browser.webRequest.onBeforeRequest.removeListener(handleRequest);
	}
	if (
		browser.webRequest.onBeforeSendHeaders.hasListener(handleRequestHeaders)
	) {
		browser.webRequest.onBeforeSendHeaders.removeListener(handleRequestHeaders);
	}
	if (browser.webRequest.onHeadersReceived.hasListener(handleResponseHeaders)) {
		browser.webRequest.onHeadersReceived.removeListener(handleResponseHeaders);
	}

	if (config.enabled) {
		// Add request interceptor
		browser.webRequest.onBeforeRequest.addListener(
			handleRequest,
			{ urls: ["<all_urls>"] },
			["blocking"]
		);

		// Add header modification listeners for masking mode
		if (config.maskingMode) {
			browser.webRequest.onBeforeSendHeaders.addListener(
				handleRequestHeaders,
				{ urls: ["<all_urls>"] },
				["blocking", "requestHeaders"]
			);

			browser.webRequest.onHeadersReceived.addListener(
				handleResponseHeaders,
				{ urls: ["<all_urls>"] },
				["blocking", "responseHeaders"]
			);
		}

		console.log("[JavaScript Proxy] Request listener enabled");
	} else {
		console.log("[JavaScript Proxy] Request listener disabled");
	}
}

// Handle messages from popup
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
	console.log("[JavaScript Proxy] Received message:", request);

	switch (request.action) {
		case "toggleProxy":
			config.enabled = request.enabled;
			browser.storage.sync.set({ enabled: config.enabled });
			updateIcon();
			updateRequestListener();
			sendResponse({ success: true, enabled: config.enabled });
			break;

		case "updateConfig":
			config = { ...config, ...request.config };
			browser.storage.sync.set(config);
			updateIcon();
			updateRequestListener();
			sendResponse({ success: true });
			break;

		case "getConfig":
			sendResponse(config);
			break;

		default:
			console.warn("[JavaScript Proxy] Unknown action:", request.action);
			sendResponse({ success: false, error: "Unknown action" });
	}

	return true; // Keep message channel open for async response
});

// Clear expired proxy requests periodically
setInterval(() => {
	const now = Date.now();
	for (const [requestId, info] of pendingProxyRequests.entries()) {
		if (now - info.timestamp > 30000) {
			pendingProxyRequests.delete(requestId);
		}
	}
}, 10000);

// Initialize on startup
initializeExtension();
