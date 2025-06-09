// Extension state
let config = {
	enabled: false,
	// Legacy fields for backward compatibility
	redirectUrl: "https://localhost:3060/src/Plugin.vue",
	urlPattern: "uploads\\/plugin-version\\/\\d+\\/file_name\\/.*\\.js(\\?.*)?",
	useCustomPattern: false,
	// New rules-based configuration
	rules: {
		js: {
			enabled: true,
			pattern: "uploads\\/plugin-version\\/\\d+\\/file_name\\/.*\\.js(\\?.*)?",
			redirectUrl: "https://localhost:3060/src/Plugin.vue",
			useCustomPattern: false,
		},
		css: {
			enabled: false,
			pattern:
				"uploads\\/plugin-version\\/\\d+\\/style_file_name\\/.*\\.css(\\?.*)?",
			redirectUrl: "",
			returnBlank: false,
			useCustomPattern: false,
		},
	},
	maskingMode: false,
	clearCacheOnEnable: true,
	disableCacheForRedirects: true,
};

let notificationTimeouts = new Map();
let cacheBlacklist = new Set();

// Initialize extension
browser.runtime.onStartup.addListener(initializeExtension);
browser.runtime.onInstalled.addListener(initializeExtension);

async function initializeExtension() {
	console.log("[JavaScript Proxy] Initializing extension...");
	try {
		// Load saved configuration
		const defaultConfig = {
			enabled: false,
			// Legacy fields for backward compatibility
			redirectUrl: "https://localhost:3060/src/Plugin.vue",
			urlPattern:
				"uploads\\/plugin-version\\/\\d+\\/file_name\\/.*\\.js(\\?.*)?",
			useCustomPattern: false,
			// New rules-based configuration
			rules: {
				js: {
					enabled: true,
					pattern:
						"uploads\\/plugin-version\\/\\d+\\/file_name\\/.*\\.js(\\?.*)?",
					redirectUrl: "https://localhost:3060/src/Plugin.vue",
					useCustomPattern: false,
				},
				css: {
					enabled: false,
					pattern:
						"uploads\\/plugin-version\\/\\d+\\/style_file_name\\/.*\\.css(\\?.*)?",
					redirectUrl: "",
					returnBlank: false,
					useCustomPattern: false,
				},
			},
			maskingMode: false,
			clearCacheOnEnable: true,
			disableCacheForRedirects: true,
		};

		const result = await browser.storage.sync.get(defaultConfig);
		config = result;

		// Migrate legacy configuration to new rules format
		config = migrateConfig(config);

		console.log("[JavaScript Proxy] Loaded configuration:", config);

		updateIcon();
		updateRequestListener();

		console.log("[JavaScript Proxy] Extension initialized successfully");
	} catch (error) {
		console.error("[JavaScript Proxy] Failed to initialize:", error);
	}
}

// Migrate legacy configuration to new rules format
function migrateConfig(config) {
	// If rules don't exist, create them from legacy config
	if (!config.rules) {
		config.rules = {
			js: {
				enabled: true,
				pattern:
					config.urlPattern ||
					"uploads\\/plugin-version\\/\\d+\\/file_name\\/.*\\.js(\\?.*)?",
				redirectUrl:
					config.redirectUrl || "https://localhost:3060/src/Plugin.vue",
				useCustomPattern: config.useCustomPattern || false,
			},
			css: {
				enabled: true,
				pattern:
					"uploads\\/plugin-version\\/\\d+\\/style_file_name\\/.*\\.css(\\?.*)?",
				redirectUrl: "",
				returnBlank: true,
				useCustomPattern: false,
			},
		};
	} else {
		// Ensure all required fields exist
		if (!config.rules.js) {
			config.rules.js = {
				enabled: true,
				pattern:
					config.urlPattern ||
					"uploads\\/plugin-version\\/\\d+\\/file_name\\/.*\\.js(\\?.*)?",
				redirectUrl:
					config.redirectUrl || "https://localhost:3060/src/Plugin.vue",
				useCustomPattern: config.useCustomPattern || false,
			};
		}
		if (!config.rules.css) {
			config.rules.css = {
				enabled: true,
				pattern:
					"uploads\\/plugin-version\\/\\d+\\/style_file_name\\/.*\\.css(\\?.*)?",
				redirectUrl: "",
				returnBlank: true,
				useCustomPattern: false,
			};
		}
	}

	return config;
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

// Cache management functions
async function clearCacheForPattern(urlPattern = null) {
	try {
		// Collect all patterns that need cache clearing
		const patterns = [];

		if (urlPattern) {
			patterns.push(urlPattern);
		} else {
			// Clear cache for all enabled rules
			for (const [ruleType, rule] of Object.entries(config.rules || {})) {
				if (rule.enabled && rule.pattern) {
					patterns.push(rule.pattern);
				}
			}

			// Include legacy pattern if exists
			if (config.urlPattern) {
				patterns.push(config.urlPattern);
			}
		}

		console.log(`[JavaScript Proxy] Clearing cache for patterns:`, patterns);

		// Clear browser cache
		await browser.browsingData.removeCache({
			origins: [], // Empty array means all origins
			since: 0, // Clear all cache entries
		});

		// Clear service worker caches for each pattern
		for (const pattern of patterns) {
			await clearServiceWorkerCaches(pattern);
		}

		console.log("[JavaScript Proxy] Cache cleared successfully");
	} catch (error) {
		console.error("[JavaScript Proxy] Error clearing cache:", error);
	}
}

async function clearServiceWorkerCaches(urlPattern) {
	try {
		// Get all active tabs
		const tabs = await browser.tabs.query({});

		// Script to clear service worker caches for matching URLs
		const clearCacheScript = `
			(async function() {
				try {
					if ('caches' in window) {
						const cacheNames = await caches.keys();
						const pattern = new RegExp("${urlPattern.replace(/\\/g, "\\\\")}", "i");
						
						for (const cacheName of cacheNames) {
							const cache = await caches.open(cacheName);
							const requests = await cache.keys();
							
							for (const request of requests) {
								if (pattern.test(request.url)) {
									await cache.delete(request);
									console.log('[JavaScript Proxy] Deleted from cache:', request.url);
								}
							}
						}
						
						// Also try to update service worker registration
						if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
							navigator.serviceWorker.controller.postMessage({
								type: 'CLEAR_CACHE_FOR_PATTERN',
								pattern: "${urlPattern.replace(/\\/g, "\\\\")}"
							});
						}
					}
				} catch (error) {
					console.error('[JavaScript Proxy] Error clearing service worker cache:', error);
				}
			})();
		`;

		// Inject the script into each tab
		for (const tab of tabs) {
			try {
				if (
					tab.url &&
					!tab.url.startsWith("moz-extension://") &&
					!tab.url.startsWith("about:")
				) {
					await browser.tabs.executeScript(tab.id, {
						code: clearCacheScript,
					});
				}
			} catch (error) {
				// Tab might not allow script injection, continue with others
				console.debug(
					`[JavaScript Proxy] Could not inject cache clear script into tab ${tab.id}:`,
					error
				);
			}
		}

		console.log("[JavaScript Proxy] Service worker cache clearing attempted");
	} catch (error) {
		console.error(
			"[JavaScript Proxy] Error clearing service worker caches:",
			error
		);
	}
}

async function addToCacheBlacklist(url) {
	try {
		const urlObj = new URL(url);
		const origin = urlObj.origin;
		cacheBlacklist.add(origin);
		console.log(`[JavaScript Proxy] Added ${origin} to cache blacklist`);
	} catch (error) {
		console.error("[JavaScript Proxy] Error adding to cache blacklist:", error);
	}
}

function shouldDisableCache(url) {
	if (!config.disableCacheForRedirects) return false;

	try {
		// Check against all enabled rules
		for (const [ruleType, rule] of Object.entries(config.rules || {})) {
			if (rule.enabled) {
				const pattern =
					rule.useCustomPattern && rule.pattern ? rule.pattern : rule.pattern;
				const regex = new RegExp(pattern, "i");
				if (regex.test(url)) {
					return true;
				}
			}
		}

		// Fallback to legacy pattern for backward compatibility
		if (config.urlPattern) {
			const regex = new RegExp(config.urlPattern, "i");
			return regex.test(url);
		}

		return false;
	} catch (error) {
		console.error(
			"[JavaScript Proxy] Error checking cache disable pattern:",
			error
		);
		return false;
	}
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

	try {
		// Check each rule type
		for (const [ruleType, rule] of Object.entries(config.rules || {})) {
			if (!rule.enabled || !rule.pattern) continue;

			// Check if this rule type matches the resource type
			if (ruleType === "js" && details.type !== "script") continue;
			if (ruleType === "css" && details.type !== "stylesheet") continue;

			const regex = new RegExp(rule.pattern, "i");

			// Test the full URL against the pattern
			if (regex.test(details.url)) {
				// Handle blank return for CSS
				if (rule.returnBlank) {
					console.log(
						`[JavaScript Proxy] Returning blank for ${ruleType}: ${details.url}`
					);
					// Return a data URL with empty content
					const blankUrl =
						ruleType === "css"
							? "data:text/css;charset=utf-8,"
							: "data:text/javascript;charset=utf-8,";
					return { redirectUrl: blankUrl };
				}

				if (rule.redirectUrl) {
					let newUrl = rule.redirectUrl;

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
							`[JavaScript Proxy] Masking ${ruleType}: ${details.url} (routing to ${newUrl})`
						);

						// Don't redirect - we'll modify headers instead
						return {};
					} else {
						// Clear cache if enabled (for traditional redirect)
						if (config.clearCacheOnEnable) {
							clearCacheForPattern(rule.pattern);
						}

						// Traditional redirect approach
						showProxyNotification(details.url, newUrl, requestType);

						console.log(
							`[JavaScript Proxy] Redirecting ${ruleType}: ${details.url} → ${newUrl}`
						);

						return { redirectUrl: newUrl };
					}
				}
			}
		}

		// Fallback to legacy pattern for backward compatibility
		if (config.urlPattern && details.type === "script") {
			const regex = new RegExp(config.urlPattern, "i");

			if (regex.test(details.url)) {
				let newUrl = config.redirectUrl;

				if (!newUrl.includes("://")) {
					newUrl = "https://" + newUrl;
				}

				const requestType = getRequestTypeDescription(details.type);

				if (details.url === newUrl || details.url.includes("localhost")) {
					console.log(
						`[JavaScript Proxy] Skipping redirect loop: ${details.url}`
					);
					return {};
				}

				if (config.maskingMode) {
					storeOriginalUrl(details.requestId, details.url, newUrl);
					console.log(
						`[JavaScript Proxy] Legacy masking: ${details.url} (routing to ${newUrl})`
					);
					return {};
				} else {
					if (config.clearCacheOnEnable) {
						clearCacheForPattern(config.urlPattern);
					}

					showProxyNotification(details.url, newUrl, requestType);
					console.log(
						`[JavaScript Proxy] Legacy redirecting: ${details.url} → ${newUrl}`
					);
					return { redirectUrl: newUrl };
				}
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

// Handle request headers for masking mode and cache control
function handleRequestHeaders(details) {
	if (!config.enabled) return {};

	// Initialize modifications
	const modifications = { requestHeaders: details.requestHeaders };
	let hasModifications = false;

	// Handle masking mode
	if (config.maskingMode) {
		const proxyInfo = pendingProxyRequests.get(details.requestId);
		if (proxyInfo) {
			// Add/modify headers to properly route to localhost
			const hostHeader = modifications.requestHeaders.find(
				(h) => h.name.toLowerCase() === "host"
			);
			if (hostHeader) {
				try {
					const proxyUrl = new URL(proxyInfo.redirectUrl);
					hostHeader.value = proxyUrl.host;
					hasModifications = true;
				} catch (error) {
					console.error("[JavaScript Proxy] Error parsing proxy URL:", error);
				}
			}
		}
	}

	// Handle cache control for URLs matching our pattern
	if (config.disableCacheForRedirects && shouldDisableCache(details.url)) {
		// Add cache-busting headers
		const cacheHeaders = [
			{ name: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
			{ name: "Pragma", value: "no-cache" },
			{ name: "Expires", value: "0" },
		];

		cacheHeaders.forEach((cacheHeader) => {
			const existingHeader = modifications.requestHeaders.find(
				(h) => h.name.toLowerCase() === cacheHeader.name.toLowerCase()
			);
			if (existingHeader) {
				existingHeader.value = cacheHeader.value;
			} else {
				modifications.requestHeaders.push(cacheHeader);
			}
			hasModifications = true;
		});

		console.log(
			`[JavaScript Proxy] Added cache-busting headers for: ${details.url}`
		);
	}

	return hasModifications ? modifications : {};
}

// Handle response headers for masking mode and cache control
function handleResponseHeaders(details) {
	if (!config.enabled) return {};

	// Initialize modifications
	const modifications = { responseHeaders: details.responseHeaders };
	let hasModifications = false;

	// Handle masking mode
	if (config.maskingMode) {
		const proxyInfo = pendingProxyRequests.get(details.requestId);
		if (proxyInfo) {
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
				hasModifications = true;
			});
		}
	}

	// Handle cache control for URLs matching our pattern
	if (config.disableCacheForRedirects && shouldDisableCache(details.url)) {
		// Add response cache-busting headers
		const cacheHeaders = [
			{ name: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
			{ name: "Pragma", value: "no-cache" },
			{ name: "Expires", value: "0" },
			{ name: "Last-Modified", value: new Date().toUTCString() },
			{ name: "ETag", value: `"${Date.now()}"` },
		];

		cacheHeaders.forEach((cacheHeader) => {
			const existingHeader = modifications.responseHeaders.find(
				(h) => h.name.toLowerCase() === cacheHeader.name.toLowerCase()
			);
			if (existingHeader) {
				existingHeader.value = cacheHeader.value;
			} else {
				modifications.responseHeaders.push(cacheHeader);
			}
			hasModifications = true;
		});

		console.log(
			`[JavaScript Proxy] Added response cache-busting headers for: ${details.url}`
		);
	}

	if (hasModifications) {
		console.log(
			`[JavaScript Proxy] Modified response headers for: ${details.url}`
		);
	}

	return hasModifications ? modifications : {};
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

		// Add header modification listeners for masking mode OR cache control
		if (config.maskingMode || config.disableCacheForRedirects) {
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
			// Clear cache when enabling the proxy
			if (config.enabled && config.clearCacheOnEnable) {
				clearCacheForPattern(); // Clear cache for all enabled patterns
			}
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

		case "clearCache":
			clearCacheForPattern() // Clear cache for all enabled patterns
				.then(() => {
					sendResponse({ success: true });
				})
				.catch((error) => {
					sendResponse({ success: false, error: error.message });
				});
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
