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
chrome.runtime.onStartup.addListener(initializeExtension);
chrome.runtime.onInstalled.addListener(initializeExtension);

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

		const result = await chrome.storage.sync.get(defaultConfig);
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
				enabled: false,
				pattern:
					"uploads\\/plugin-version\\/\\d+\\/style_file_name\\/.*\\.css(\\?.*)?",
				redirectUrl: "",
				returnBlank: false,
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
				enabled: false,
				pattern:
					"uploads\\/plugin-version\\/\\d+\\/style_file_name\\/.*\\.css(\\?.*)?",
				redirectUrl: "",
				returnBlank: false,
				useCustomPattern: false,
			};
		}
	}

	return config;
}

// Update toolbar icon based on state
function updateIcon() {
	const iconPath = config.enabled ? "icons/gx_on" : "icons/gx_off";
	chrome.action.setIcon({
		path: {
			16: `${iconPath}_16.png`,
			32: `${iconPath}_32.png`,
			64: `${iconPath}_64.png`,
			128: `${iconPath}_128.png`,
		},
	});

	const title = config.enabled
		? "JavaScript Proxy (ON)"
		: "JavaScript Proxy (OFF)";
	chrome.action.setTitle({ title });
}

// Cache management functions
async function clearCacheForPattern(urlPattern) {
	try {
		console.log(`[JavaScript Proxy] Clearing cache for pattern: ${urlPattern}`);

		// Clear browser cache
		await chrome.browsingData.removeCache({
			origins: [], // Empty array means all origins
			since: 0, // Clear all cache entries
		});

		// Clear service worker caches by injecting script into active tabs
		await clearServiceWorkerCaches(urlPattern);

		console.log("[JavaScript Proxy] Cache cleared successfully");
	} catch (error) {
		console.error("[JavaScript Proxy] Error clearing cache:", error);
		throw error; // Re-throw to let the caller handle the error
	}
}

async function clearServiceWorkerCaches(urlPattern) {
	try {
		// Get all active tabs
		const tabs = await chrome.tabs.query({});

		// Inject the script into each tab
		for (const tab of tabs) {
			try {
				if (
					tab.url &&
					!tab.url.startsWith("chrome://") &&
					!tab.url.startsWith("chrome-extension://")
				) {
					await chrome.scripting.executeScript({
						target: { tabId: tab.id },
						func: async function (pattern) {
							try {
								if ("caches" in window) {
									const cacheNames = await caches.keys();
									const regex = new RegExp(pattern, "i");

									for (const cacheName of cacheNames) {
										const cache = await caches.open(cacheName);
										const requests = await cache.keys();

										for (const request of requests) {
											if (regex.test(request.url)) {
												await cache.delete(request);
												console.log(
													"[JavaScript Proxy] Deleted from cache:",
													request.url
												);
											}
										}
									}

									// Also try to update service worker registration
									if (
										"serviceWorker" in navigator &&
										navigator.serviceWorker.controller
									) {
										navigator.serviceWorker.controller.postMessage({
											type: "CLEAR_CACHE_FOR_PATTERN",
											pattern: pattern,
										});
									}
								}
							} catch (error) {
								console.error(
									"[JavaScript Proxy] Error clearing service worker cache:",
									error
								);
							}
						},
						args: [urlPattern.replace(/\\/g, "\\\\")],
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

// Handle web requests (Chrome Manifest V3 uses declarativeNetRequest)
async function updateRequestListener() {
	// Remove all existing rules
	try {
		await chrome.declarativeNetRequest.updateDynamicRules({
			removeRuleIds: [1, 2, 3, 4, 5], // Remove up to 5 rules
		});
	} catch (error) {
		// Rules might not exist, that's fine
	}

	if (config.enabled && !config.maskingMode) {
		const rulesToAdd = [];
		let ruleId = 1;

		// Process each rule type
		for (const [ruleType, rule] of Object.entries(config.rules || {})) {
			if (rule.enabled && rule.pattern) {
				if (rule.returnBlank) {
					// For blank returns, we'll handle in webRequest (can't return blank with declarativeNetRequest)
					continue;
				}

				if (rule.redirectUrl) {
					// Clear cache if enabled
					if (config.clearCacheOnEnable) {
						await clearCacheForPattern(rule.pattern);
					}

					// Add redirect rule using declarativeNetRequest
					const redirectRule = {
						id: ruleId++,
						priority: 1,
						action: {
							type: "redirect",
							redirect: {
								url: rule.redirectUrl,
							},
						},
						condition: {
							regexFilter: rule.pattern,
							resourceTypes: ruleType === "js" ? ["script"] : ["stylesheet"],
						},
					};

					rulesToAdd.push(redirectRule);
				}
			}
		}

		// Add legacy rule for backward compatibility
		if (config.urlPattern && config.redirectUrl && rulesToAdd.length === 0) {
			if (config.clearCacheOnEnable) {
				await clearCacheForPattern(config.urlPattern);
			}

			const legacyRule = {
				id: ruleId++,
				priority: 1,
				action: {
					type: "redirect",
					redirect: {
						url: config.redirectUrl,
					},
				},
				condition: {
					regexFilter: config.urlPattern,
					resourceTypes: ["script"],
				},
			};

			rulesToAdd.push(legacyRule);
		}

		if (rulesToAdd.length > 0) {
			try {
				await chrome.declarativeNetRequest.updateDynamicRules({
					addRules: rulesToAdd,
				});
				console.log("[JavaScript Proxy] Added redirect rules:", rulesToAdd);
			} catch (error) {
				console.error("[JavaScript Proxy] Error adding redirect rules:", error);
			}
		}
	}

	// For masking mode or blank returns, we need webRequest API
	updateWebRequestListener();
}

// Handle web requests for masking mode and blank returns (fallback to webRequest for complex logic)
function handleRequest(details) {
	if (!config.enabled) return {};

	// Skip data URLs and blob URLs
	if (
		details.url.startsWith("data:") ||
		details.url.startsWith("blob:") ||
		details.url.startsWith("chrome:") ||
		details.url.startsWith("chrome-extension:")
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

				// Handle masking mode or rules without declarativeNetRequest redirect
				if (config.maskingMode || !rule.redirectUrl) {
					if (rule.redirectUrl) {
						let newUrl = rule.redirectUrl;

						// Ensure URL has protocol
						if (!newUrl.includes("://")) {
							newUrl = "https://" + newUrl;
						}

						// Check if this would create a redirect loop
						if (details.url === newUrl || details.url.includes("localhost")) {
							console.log(
								`[JavaScript Proxy] Skipping redirect loop: ${details.url}`
							);
							return {};
						}

						// Store original URL for header modification
						storeOriginalUrl(details.requestId, details.url, newUrl);

						console.log(
							`[JavaScript Proxy] Masking ${ruleType}: ${details.url} (routing to ${newUrl})`
						);

						return { redirectUrl: newUrl };
					}
				}
			}
		}

		// Fallback to legacy pattern for backward compatibility
		if (config.maskingMode && config.urlPattern) {
			const regex = new RegExp(config.urlPattern, "i");

			if (regex.test(details.url) && details.type === "script") {
				let newUrl = config.redirectUrl;

				if (!newUrl.includes("://")) {
					newUrl = "https://" + newUrl;
				}

				if (details.url === newUrl || details.url.includes("localhost")) {
					console.log(
						`[JavaScript Proxy] Skipping redirect loop: ${details.url}`
					);
					return {};
				}

				storeOriginalUrl(details.requestId, details.url, newUrl);

				console.log(
					`[JavaScript Proxy] Legacy masking: ${details.url} (routing to ${newUrl})`
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

// Update webRequest listener for masking mode
function updateWebRequestListener() {
	// Remove existing listeners
	if (
		chrome.webRequest &&
		chrome.webRequest.onBeforeRequest.hasListener(handleRequest)
	) {
		chrome.webRequest.onBeforeRequest.removeListener(handleRequest);
	}
	if (
		chrome.webRequest &&
		chrome.webRequest.onBeforeSendHeaders.hasListener(handleRequestHeaders)
	) {
		chrome.webRequest.onBeforeSendHeaders.removeListener(handleRequestHeaders);
	}
	if (
		chrome.webRequest &&
		chrome.webRequest.onHeadersReceived.hasListener(handleResponseHeaders)
	) {
		chrome.webRequest.onHeadersReceived.removeListener(handleResponseHeaders);
	}

	// Check if we need webRequest for any features
	const needsWebRequest =
		config.maskingMode ||
		config.disableCacheForRedirects ||
		Object.values(config.rules || {}).some(
			(rule) => rule.enabled && rule.returnBlank
		);

	// Add webRequest listeners for masking mode, cache control, or blank returns
	if (config.enabled && chrome.webRequest && needsWebRequest) {
		chrome.webRequest.onBeforeRequest.addListener(
			handleRequest,
			{ urls: ["<all_urls>"] },
			["blocking"]
		);

		chrome.webRequest.onBeforeSendHeaders.addListener(
			handleRequestHeaders,
			{ urls: ["<all_urls>"] },
			["blocking", "requestHeaders"]
		);

		chrome.webRequest.onHeadersReceived.addListener(
			handleResponseHeaders,
			{ urls: ["<all_urls>"] },
			["blocking", "responseHeaders"]
		);

		console.log(
			"[JavaScript Proxy] WebRequest listeners enabled for masking mode"
		);
	} else {
		console.log("[JavaScript Proxy] WebRequest listeners disabled");
	}
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
			{
				name: "Cache-Control",
				value: "no-cache, no-store, must-revalidate, max-age=0",
			},
			{ name: "Pragma", value: "no-cache" },
			{ name: "Expires", value: "0" },
			{ name: "If-None-Match", value: "*" },
			{ name: "If-Modified-Since", value: "Thu, 01 Jan 1970 00:00:00 GMT" },
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
		// Add aggressive response cache-busting headers
		const cacheHeaders = [
			{
				name: "Cache-Control",
				value: "no-cache, no-store, must-revalidate, max-age=0, s-maxage=0",
			},
			{ name: "Pragma", value: "no-cache" },
			{ name: "Expires", value: "Thu, 01 Jan 1970 00:00:00 GMT" },
			{ name: "Last-Modified", value: new Date().toUTCString() },
			{ name: "ETag", value: `"${Date.now()}-${Math.random()}"` },
			{ name: "Vary", value: "*" },
			{ name: "X-Cache-Control", value: "no-cache" },
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

// Show desktop notification for proxy activity (when using masking mode)
function showProxyNotification(from, to, requestType = "") {
	const shortFrom = from.length > 50 ? from.substring(0, 47) + "..." : from;
	const shortTo = to.length > 30 ? to.substring(0, 27) + "..." : to;

	const notificationId = `proxy-${Date.now()}`;

	chrome.notifications.create(notificationId, {
		type: "basic",
		iconUrl: "icons/gx_on_64.png",
		title: "JavaScript Proxy Active",
		message: `${requestType}\n${shortFrom}\n→ ${shortTo}`,
	});

	// Clear existing timeout for this type
	if (notificationTimeouts.has("proxy")) {
		clearTimeout(notificationTimeouts.get("proxy"));
	}

	// Auto-dismiss after 3 seconds
	const timeoutId = setTimeout(() => {
		chrome.notifications.clear(notificationId);
		notificationTimeouts.delete("proxy");
	}, 3000);

	notificationTimeouts.set("proxy", timeoutId);
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	console.log("[JavaScript Proxy] Received message:", request);

	switch (request.action) {
		case "toggleProxy":
			config.enabled = request.enabled;
			chrome.storage.sync.set({ enabled: config.enabled });
			updateIcon();
			updateRequestListener();
			// Clear cache when enabling the proxy
			if (config.enabled && config.clearCacheOnEnable) {
				clearCacheForPattern(config.urlPattern);
			}
			sendResponse({ success: true, enabled: config.enabled });
			return false; // Synchronous response

		case "updateConfig":
			config = { ...config, ...request.config };
			chrome.storage.sync.set(config);
			updateIcon();
			updateRequestListener();
			sendResponse({ success: true });
			return false; // Synchronous response

		case "getConfig":
			sendResponse(config);
			return false; // Synchronous response

		case "clearCache":
			console.log(
				"[JavaScript Proxy] Starting cache clear for pattern:",
				config.urlPattern
			);
			clearCacheForPattern(config.urlPattern)
				.then(() => {
					console.log("[JavaScript Proxy] Cache clear completed successfully");
					sendResponse({ success: true });
				})
				.catch((error) => {
					console.error("[JavaScript Proxy] Cache clear error:", error);
					sendResponse({
						success: false,
						error: error.message || error.toString(),
					});
				});
			return true; // Keep message channel open for async response

		default:
			console.warn("[JavaScript Proxy] Unknown action:", request.action);
			sendResponse({ success: false, error: "Unknown action" });
			return false; // Synchronous response
	}
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
