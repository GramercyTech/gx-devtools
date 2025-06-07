// Extension state
let isProxyEnabled = false;
let proxyRules = [];
let useMasking = false;

// Default proxy rules
const defaultRules = [
	{
		pattern: "api\\.example\\.com",
		redirect: "api.alternative.com",
		maskUrl: false,
	},
];

// Initialize extension
chrome.runtime.onStartup.addListener(initializeExtension);
chrome.runtime.onInstalled.addListener(initializeExtension);

async function initializeExtension() {
	console.log("[Traffic Proxy] Initializing Chrome extension...");
	try {
		// Load saved state
		const result = await chrome.storage.local.get([
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
		await updateDeclarativeRules();

		console.log("[Traffic Proxy] Chrome extension initialized successfully");
	} catch (error) {
		console.error("[Traffic Proxy] Failed to initialize:", error);
	}
}

// Update toolbar icon based on state
function updateIcon() {
	const iconPath = isProxyEnabled ? "icons/gx_on" : "icons/gx_off";
	chrome.action.setIcon({
		path: {
			16: `${iconPath}_16.png`,
			32: `${iconPath}_32.png`,
			48: `${iconPath}_48.png`,
			128: `${iconPath}_128.png`,
		},
	});

	const title = isProxyEnabled ? "Traffic Proxy (ON)" : "Traffic Proxy (OFF)";
	chrome.action.setTitle({ title });
}

// Convert our rules to Chrome's declarativeNetRequest format
function convertToDeclarativeRules(rules) {
	if (!isProxyEnabled) return [];

	const declarativeRules = [];
	let ruleId = 1;

	rules.forEach((rule, index) => {
		// Create URL filter from regex pattern
		let urlFilter;
		try {
			// Convert regex pattern to a simpler URL filter
			// This is a simplified conversion - Chrome's declarativeNetRequest doesn't support full regex
			urlFilter = rule.pattern
				.replace(/\\\./g, ".") // Convert \. to .
				.replace(/\(\[.*?\]\+\\\.\)/g, "*.") // Convert ([a-zA-Z0-9-]+\.) to *.
				.replace(/\$.*$/, "") // Remove end anchors
				.replace(/\^.*$/, ""); // Remove start anchors

			// Ensure it starts with a valid scheme pattern
			if (!urlFilter.includes("://") && !urlFilter.startsWith("*")) {
				urlFilter =
					"*://*" + (urlFilter.startsWith(".") ? "" : ".") + urlFilter + "*";
			}
		} catch (error) {
			console.warn(
				`[Traffic Proxy] Could not convert pattern ${rule.pattern} to URL filter:`,
				error
			);
			return;
		}

		if (rule.maskUrl || useMasking) {
			// For masking, we'll use modifyHeaders action
			declarativeRules.push({
				id: ruleId++,
				priority: 1,
				action: {
					type: "modifyHeaders",
					requestHeaders: [
						{
							header: "X-Proxy-Original-Host",
							operation: "set",
							value: rule.pattern.replace(/[\\\[\]\(\)\+\*\?\^\$\|]/g, ""), // Clean pattern for header
						},
						{
							header: "Host",
							operation: "set",
							value: rule.redirect,
						},
					],
				},
				condition: {
					urlFilter: urlFilter,
					resourceTypes: [
						"main_frame",
						"sub_frame",
						"stylesheet",
						"script",
						"image",
						"font",
						"object",
						"xmlhttprequest",
						"ping",
						"csp_report",
						"media",
						"websocket",
						"other",
					],
				},
			});
		} else {
			// For redirects, use redirect action
			declarativeRules.push({
				id: ruleId++,
				priority: 1,
				action: {
					type: "redirect",
					redirect: {
						regexSubstitution: rule.redirect,
					},
				},
				condition: {
					regexFilter: rule.pattern,
					resourceTypes: [
						"main_frame",
						"sub_frame",
						"stylesheet",
						"script",
						"image",
						"font",
						"object",
						"xmlhttprequest",
						"ping",
						"csp_report",
						"media",
						"websocket",
						"other",
					],
				},
			});
		}
	});

	return declarativeRules;
}

// Update declarative rules
async function updateDeclarativeRules() {
	try {
		// Clear existing rules
		const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
		const ruleIdsToRemove = existingRules.map((rule) => rule.id);

		if (ruleIdsToRemove.length > 0) {
			await chrome.declarativeNetRequest.updateDynamicRules({
				removeRuleIds: ruleIdsToRemove,
			});
		}

		if (isProxyEnabled && proxyRules.length > 0) {
			// Add new rules
			const newRules = convertToDeclarativeRules(proxyRules);
			console.log("[Traffic Proxy] Adding declarative rules:", newRules);

			if (newRules.length > 0) {
				await chrome.declarativeNetRequest.updateDynamicRules({
					addRules: newRules,
				});
			}
		}

		console.log("[Traffic Proxy] Declarative rules updated");
	} catch (error) {
		console.error("[Traffic Proxy] Failed to update declarative rules:", error);
	}
}

// Show proxy notification
function showProxyNotification(from, to, requestType = "") {
	const notificationId = `proxy-${Date.now()}`;
	const typeText = requestType ? ` (${requestType})` : "";

	chrome.notifications.create(notificationId, {
		type: "basic",
		iconUrl: "icons/gx_on_48.png",
		title: "Traffic Proxied",
		message: `${from} → ${to}${typeText}`,
	});

	// Auto-close notification after 3 seconds
	setTimeout(() => {
		chrome.notifications.clear(notificationId);
	}, 3000);
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	(async () => {
		try {
			switch (message.action) {
				case "toggleProxy":
					isProxyEnabled = !isProxyEnabled;
					await chrome.storage.local.set({ proxyEnabled: isProxyEnabled });
					updateIcon();
					await updateDeclarativeRules();
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
					await chrome.storage.local.set({ proxyRules: proxyRules });
					await updateDeclarativeRules();
					sendResponse({ success: true });
					break;

				case "setMaskingMode":
					useMasking = message.enabled;
					await chrome.storage.local.set({ useMasking: useMasking });
					await updateDeclarativeRules();
					console.log(
						`[Traffic Proxy] Masking mode: ${
							useMasking ? "enabled" : "disabled"
						}`
					);
					sendResponse({ success: true });
					break;

				default:
					sendResponse({ error: "Unknown action" });
			}
		} catch (error) {
			console.error("[Traffic Proxy] Error handling message:", error);
			sendResponse({ error: error.message });
		}
	})();

	return true; // Keep message channel open for async response
});

// Listen for declarativeNetRequest rule matches (for notifications)
if (
	chrome.declarativeNetRequest &&
	chrome.declarativeNetRequest.onRuleMatchedDebug
) {
	chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((details) => {
		console.log("[Traffic Proxy] Rule matched:", details);

		// Find which rule was matched to show appropriate notification
		const matchedRule = proxyRules.find((rule, index) => {
			// This is a simplified match - in real implementation you'd need better tracking
			return details.request.url.includes(
				rule.pattern.replace(/[\\\[\]\(\)\+\*\?\^\$\|]/g, "")
			);
		});

		if (matchedRule) {
			const url = new URL(details.request.url);
			showProxyNotification(
				url.hostname,
				matchedRule.redirect,
				details.request.type || "Request"
			);
		}
	});
}
