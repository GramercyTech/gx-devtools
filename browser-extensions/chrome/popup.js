document.addEventListener("DOMContentLoaded", async function () {
	// Get all DOM elements
	const toggleButton = document.getElementById("toggleButton");
	const toggleText = document.getElementById("toggleText");
	const saveButton = document.getElementById("saveButton");
	const statusDiv = document.getElementById("status");
	const maskingModeCheckbox = document.getElementById("maskingMode");
	const clearCacheOnEnableCheckbox =
		document.getElementById("clearCacheOnEnable");
	const disableCacheForRedirectsCheckbox = document.getElementById(
		"disableCacheForRedirects"
	);
	const clearCacheButton = document.getElementById("clearCacheButton");

	// Inspector elements
	const inspectorToggle = document.getElementById("inspectorToggle");
	const inspectorText = document.getElementById("inspectorText");

	// Inspector state
	let inspectorEnabled = false;

	// JS Rule elements
	const jsRuleEnabled = document.getElementById("jsRuleEnabled");
	const jsRuleContent = document.getElementById("jsRuleContent");
	const jsRedirectUrl = document.getElementById("jsRedirectUrl");
	const jsCustomPattern = document.getElementById("jsCustomPattern");
	const jsPatternDisplay = document.getElementById("jsPatternDisplay");
	const jsCustomPatternInput = document.getElementById("jsCustomPatternInput");

	// CSS Rule elements
	const cssRuleEnabled = document.getElementById("cssRuleEnabled");
	const cssRuleContent = document.getElementById("cssRuleContent");
	const cssRedirectUrl = document.getElementById("cssRedirectUrl");
	const cssReturnBlank = document.getElementById("cssReturnBlank");
	const cssRedirectSection = document.getElementById("cssRedirectSection");
	const cssCustomPattern = document.getElementById("cssCustomPattern");
	const cssPatternDisplay = document.getElementById("cssPatternDisplay");
	const cssCustomPatternInput = document.getElementById(
		"cssCustomPatternInput"
	);

	// Default configuration
	const defaultConfig = {
		enabled: false,
		// Legacy fields for backward compatibility
		redirectUrl: "https://localhost:3060/src/Plugin.vue",
		urlPattern: "uploads\\/plugin-version\\/\\d+\\/file_name\\/.*\\.js(\\?.*)?",
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
				enabled: true,
				pattern:
					"uploads\\/plugin-version\\/\\d+\\/style_file_name\\/.*\\.css(\\?.*)?",
				redirectUrl: "",
				returnBlank: true,
				useCustomPattern: false,
			},
		},
		maskingMode: false,
		clearCacheOnEnable: true,
		disableCacheForRedirects: true,
	};

	// Load current configuration
	let config = {};
	try {
		const result = await chrome.storage.sync.get(defaultConfig);
		config = result;

		// Migrate legacy config if needed
		config = migrateConfig(config);
	} catch (error) {
		console.error("Error loading config:", error);
		config = defaultConfig;
	}

	// Initialize UI with loaded config
	updateUI();
	updatePatternDisplays();

	function migrateConfig(config) {
		// If rules don't exist, create them from legacy config
		if (!config.rules) {
			config.rules = {
				js: {
					enabled: true,
					pattern: config.urlPattern || defaultConfig.rules.js.pattern,
					redirectUrl: config.redirectUrl || defaultConfig.rules.js.redirectUrl,
					useCustomPattern: config.useCustomPattern || false,
				},
				css: {
					enabled: true,
					pattern: defaultConfig.rules.css.pattern,
					redirectUrl: "",
					returnBlank: true,
					useCustomPattern: false,
				},
			};
		}
		return config;
	}

	function updateUI() {
		// Update toggle button
		if (config.enabled) {
			toggleButton.classList.add("enabled");
			toggleText.textContent = "ON";
		} else {
			toggleButton.classList.remove("enabled");
			toggleText.textContent = "OFF";
		}

		// Update global settings
		maskingModeCheckbox.checked = config.maskingMode || false;
		clearCacheOnEnableCheckbox.checked = config.clearCacheOnEnable !== false;
		disableCacheForRedirectsCheckbox.checked =
			config.disableCacheForRedirects !== false;

		// Update JS rule
		if (config.rules && config.rules.js) {
			jsRuleEnabled.checked = config.rules.js.enabled;
			jsRedirectUrl.value = config.rules.js.redirectUrl || "";
			jsCustomPattern.checked = config.rules.js.useCustomPattern || false;
			jsCustomPatternInput.value = config.rules.js.pattern || "";

			// Toggle JS rule content visibility
			if (config.rules.js.enabled) {
				jsRuleContent.classList.remove("rule-disabled");
			} else {
				jsRuleContent.classList.add("rule-disabled");
			}

			// Toggle custom pattern input visibility
			if (config.rules.js.useCustomPattern) {
				jsCustomPatternInput.classList.add("visible");
				jsPatternDisplay.style.display = "none";
			} else {
				jsCustomPatternInput.classList.remove("visible");
				jsPatternDisplay.style.display = "block";
			}
		}

		// Update CSS rule
		if (config.rules && config.rules.css) {
			cssRuleEnabled.checked = config.rules.css.enabled;
			cssRedirectUrl.value = config.rules.css.redirectUrl || "";
			cssReturnBlank.checked = config.rules.css.returnBlank || false;
			cssCustomPattern.checked = config.rules.css.useCustomPattern || false;
			cssCustomPatternInput.value = config.rules.css.pattern || "";

			// Toggle CSS rule content visibility
			if (config.rules.css.enabled) {
				cssRuleContent.classList.remove("rule-disabled");
			} else {
				cssRuleContent.classList.add("rule-disabled");
			}

			// Toggle redirect section based on blank return setting
			if (config.rules.css.returnBlank) {
				cssRedirectSection.style.display = "none";
			} else {
				cssRedirectSection.style.display = "block";
			}

			// Toggle custom pattern input visibility
			if (config.rules.css.useCustomPattern) {
				cssCustomPatternInput.classList.add("visible");
				cssPatternDisplay.style.display = "none";
			} else {
				cssCustomPatternInput.classList.remove("visible");
				cssPatternDisplay.style.display = "block";
			}
		}
	}

	function updatePatternDisplays() {
		// Update JS pattern display
		if (config.rules && config.rules.js) {
			const jsPattern = config.rules.js.useCustomPattern
				? config.rules.js.pattern
				: defaultConfig.rules.js.pattern;
			jsPatternDisplay.textContent = jsPattern;
		}

		// Update CSS pattern display
		if (config.rules && config.rules.css) {
			const cssPattern = config.rules.css.useCustomPattern
				? config.rules.css.pattern
				: defaultConfig.rules.css.pattern;
			cssPatternDisplay.textContent = cssPattern;
		}
	}

	function showStatus(message, isSuccess = true) {
		statusDiv.textContent = message;
		statusDiv.className = `status ${isSuccess ? "success" : "error"}`;
		statusDiv.style.display = "block";

		setTimeout(() => {
			statusDiv.style.display = "none";
		}, 3000);
	}

	function validateRedirectUrl(url) {
		if (!url || url.trim() === "") {
			return null; // Empty URL is valid for optional fields
		}

		try {
			new URL(url);
			return null; // Valid
		} catch {
			// Check if it's a relative-style URL like localhost:3060/path
			if (url.includes("://")) {
				return "Invalid URL format";
			}

			// Try to parse as localhost-style URL
			try {
				new URL("https://" + url);
				return null; // Valid
			} catch {
				return "Invalid URL format";
			}
		}
	}

	function validatePattern(pattern) {
		if (!pattern || pattern.trim() === "") {
			return "URL pattern is required";
		}

		try {
			new RegExp(pattern);
			return null; // Valid
		} catch {
			return "Invalid regular expression pattern";
		}
	}

	function normalizeUrl(url) {
		if (!url || url.trim() === "") return "";
		if (!url.includes("://")) {
			return "https://" + url;
		}
		return url;
	}

	// Event listeners
	toggleButton.addEventListener("click", async function () {
		config.enabled = !config.enabled;

		try {
			await chrome.storage.sync.set({ enabled: config.enabled });
			updateUI();

			// Send message to background script
			chrome.runtime.sendMessage({
				action: "toggleProxy",
				enabled: config.enabled,
			});

			showStatus(config.enabled ? "Proxy enabled" : "Proxy disabled");
		} catch (error) {
			console.error("Error toggling proxy:", error);
			showStatus("Error toggling proxy", false);
		}
	});

	// Global settings event listeners
	maskingModeCheckbox.addEventListener("change", function () {
		config.maskingMode = this.checked;
	});

	clearCacheOnEnableCheckbox.addEventListener("change", function () {
		config.clearCacheOnEnable = this.checked;
	});

	disableCacheForRedirectsCheckbox.addEventListener("change", function () {
		config.disableCacheForRedirects = this.checked;
	});

	// JS rule event listeners
	jsRuleEnabled.addEventListener("change", function () {
		if (!config.rules) config.rules = {};
		if (!config.rules.js) config.rules.js = { ...defaultConfig.rules.js };
		config.rules.js.enabled = this.checked;
		updateUI();
	});

	jsCustomPattern.addEventListener("change", function () {
		if (!config.rules) config.rules = {};
		if (!config.rules.js) config.rules.js = { ...defaultConfig.rules.js };
		config.rules.js.useCustomPattern = this.checked;
		updateUI();
		updatePatternDisplays();
	});

	// CSS rule event listeners
	cssRuleEnabled.addEventListener("change", function () {
		if (!config.rules) config.rules = {};
		if (!config.rules.css) config.rules.css = { ...defaultConfig.rules.css };
		config.rules.css.enabled = this.checked;
		updateUI();
	});

	cssReturnBlank.addEventListener("change", function () {
		if (!config.rules) config.rules = {};
		if (!config.rules.css) config.rules.css = { ...defaultConfig.rules.css };
		config.rules.css.returnBlank = this.checked;
		updateUI();
	});

	cssCustomPattern.addEventListener("change", function () {
		if (!config.rules) config.rules = {};
		if (!config.rules.css) config.rules.css = { ...defaultConfig.rules.css };
		config.rules.css.useCustomPattern = this.checked;
		updateUI();
		updatePatternDisplays();
	});

	clearCacheButton.addEventListener("click", async function () {
		try {
			this.textContent = "Clearing...";
			this.disabled = true;

			const response = await chrome.runtime.sendMessage({
				action: "clearCache",
			});

			if (response.success) {
				showStatus("Cache cleared successfully");
			} else {
				showStatus(
					"Error clearing cache: " + (response.error || "Unknown error"),
					false
				);
			}
		} catch (error) {
			console.error("Error clearing cache:", error);
			showStatus("Error clearing cache", false);
		} finally {
			this.textContent = "Clear Cache Now";
			this.disabled = false;
		}
	});

	saveButton.addEventListener("click", async function () {
		// Ensure rules structure exists
		if (!config.rules) config.rules = {};
		if (!config.rules.js) config.rules.js = { ...defaultConfig.rules.js };
		if (!config.rules.css) config.rules.css = { ...defaultConfig.rules.css };

		// Validate JS rule if enabled
		if (config.rules.js.enabled) {
			const jsRedirectUrlValue = jsRedirectUrl.value.trim();
			const jsPatternValue = config.rules.js.useCustomPattern
				? jsCustomPatternInput.value.trim()
				: defaultConfig.rules.js.pattern;

			if (!jsRedirectUrlValue) {
				showStatus(
					"JavaScript redirect URL is required when JS rule is enabled",
					false
				);
				return;
			}

			const jsUrlError = validateRedirectUrl(jsRedirectUrlValue);
			if (jsUrlError) {
				showStatus("JavaScript rule: " + jsUrlError, false);
				return;
			}

			const jsPatternError = validatePattern(jsPatternValue);
			if (jsPatternError) {
				showStatus("JavaScript rule: " + jsPatternError, false);
				return;
			}

			// Update JS rule config
			config.rules.js.redirectUrl = normalizeUrl(jsRedirectUrlValue);
			config.rules.js.pattern = jsPatternValue;
		}

		// Validate CSS rule if enabled
		if (config.rules.css.enabled) {
			const cssRedirectUrlValue = cssRedirectUrl.value.trim();
			const cssPatternValue = config.rules.css.useCustomPattern
				? cssCustomPatternInput.value.trim()
				: defaultConfig.rules.css.pattern;

			// Only validate redirect URL if not returning blank
			if (!config.rules.css.returnBlank && !cssRedirectUrlValue) {
				showStatus(
					"CSS redirect URL is required when CSS rule is enabled and not returning blank",
					false
				);
				return;
			}

			if (!config.rules.css.returnBlank) {
				const cssUrlError = validateRedirectUrl(cssRedirectUrlValue);
				if (cssUrlError) {
					showStatus("CSS rule: " + cssUrlError, false);
					return;
				}
			}

			const cssPatternError = validatePattern(cssPatternValue);
			if (cssPatternError) {
				showStatus("CSS rule: " + cssPatternError, false);
				return;
			}

			// Update CSS rule config
			config.rules.css.redirectUrl = normalizeUrl(cssRedirectUrlValue);
			config.rules.css.pattern = cssPatternValue;
		}

		try {
			await chrome.storage.sync.set(config);

			// Send updated config to background script
			chrome.runtime.sendMessage({
				action: "updateConfig",
				config: config,
			});

			updateUI();
			updatePatternDisplays();
			showStatus("Configuration saved successfully");
		} catch (error) {
			console.error("Error saving config:", error);
			showStatus("Error saving configuration", false);
		}
	});

	// Send initial config to background script
	chrome.runtime.sendMessage({
		action: "updateConfig",
		config: config,
	});

	// ============================================================
	// Component Inspector
	// ============================================================

	function updateInspectorUI() {
		if (inspectorEnabled) {
			inspectorToggle.classList.add("enabled");
			inspectorText.textContent = "ON";
		} else {
			inspectorToggle.classList.remove("enabled");
			inspectorText.textContent = "OFF";
		}
	}

	// Get initial inspector state from content script
	async function getInspectorState() {
		try {
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});
			if (tab?.id) {
				const response = await chrome.tabs.sendMessage(tab.id, {
					action: "getInspectorState",
				});
				if (response) {
					inspectorEnabled = response.enabled;
					updateInspectorUI();
				}
			}
		} catch (error) {
			// Content script might not be loaded yet
			console.log("Could not get inspector state:", error);
		}
	}

	// Toggle inspector
	inspectorToggle.addEventListener("click", async function () {
		try {
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});
			if (tab?.id) {
				const response = await chrome.tabs.sendMessage(tab.id, {
					action: "toggleInspector",
				});
				if (response) {
					inspectorEnabled = response.enabled;
					updateInspectorUI();
					showStatus(
						inspectorEnabled ? "Inspector enabled" : "Inspector disabled"
					);
				}
			}
		} catch (error) {
			showStatus("Could not toggle inspector. Make sure you're on a web page.", false);
		}
	});

	// Initialize inspector state
	getInspectorState();
});
