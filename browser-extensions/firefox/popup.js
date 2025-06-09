// Configuration defaults
const DEFAULT_CONFIG = {
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

// Global state
let config = { ...DEFAULT_CONFIG };
let pendingChanges = false;

// DOM elements
const elements = {
	// Status and main toggle
	statusMessage: null,
	masterToggle: null,
	statusInfo: null,

	// JavaScript rule elements
	jsRuleContainer: null,
	jsRuleToggle: null,
	jsRedirectUrl: null,
	jsUseCustomPattern: null,
	jsPattern: null,
	jsPatternGroup: null,

	// CSS rule elements
	cssRuleContainer: null,
	cssRuleToggle: null,
	cssRedirectUrl: null,
	cssReturnBlank: null,
	cssUseCustomPattern: null,
	cssPattern: null,
	cssPatternGroup: null,
	cssRedirectGroup: null,

	// Advanced settings
	advancedHeader: null,
	advancedContent: null,
	advancedToggle: null,
	maskingMode: null,
	clearCacheOnEnable: null,
	disableCacheForRedirects: null,

	// Action buttons
	saveBtn: null,
	clearCacheBtn: null,
};

// Initialize popup
document.addEventListener("DOMContentLoaded", async () => {
	try {
		initializeElements();
		setupEventListeners();
		await loadConfiguration();
		updateUI();
		console.log("[JavaScript Proxy] Popup initialized successfully");
	} catch (error) {
		console.error("[JavaScript Proxy] Error initializing popup:", error);
		showStatus("Error initializing popup: " + error.message, "error");
	}
});

// Initialize DOM elements
function initializeElements() {
	// Get all elements and store in global object
	for (const key in elements) {
		const element = document.getElementById(key);
		if (!element) {
			throw new Error(`Required element not found: ${key}`);
		}
		elements[key] = element;
	}
}

// Setup event listeners
function setupEventListeners() {
	// Master toggle
	elements.masterToggle.addEventListener("change", handleMasterToggle);

	// Rule toggles
	elements.jsRuleToggle.addEventListener("change", () =>
		handleRuleToggle("js")
	);
	elements.cssRuleToggle.addEventListener("change", () =>
		handleRuleToggle("css")
	);

	// JavaScript rule events
	elements.jsRedirectUrl.addEventListener("input", () =>
		handleFieldChange("js", "redirectUrl")
	);
	elements.jsUseCustomPattern.addEventListener("change", () =>
		handleCustomPatternToggle("js")
	);
	elements.jsPattern.addEventListener("input", () =>
		handleFieldChange("js", "pattern")
	);

	// CSS rule events
	elements.cssRedirectUrl.addEventListener("input", () =>
		handleFieldChange("css", "redirectUrl")
	);
	elements.cssReturnBlank.addEventListener("change", handleCssBlankToggle);
	elements.cssUseCustomPattern.addEventListener("change", () =>
		handleCustomPatternToggle("css")
	);
	elements.cssPattern.addEventListener("input", () =>
		handleFieldChange("css", "pattern")
	);

	// Advanced settings toggle
	elements.advancedHeader.addEventListener("click", toggleAdvancedSettings);

	// Advanced settings checkboxes
	elements.maskingMode.addEventListener("change", () =>
		handleAdvancedSettingChange("maskingMode")
	);
	elements.clearCacheOnEnable.addEventListener("change", () =>
		handleAdvancedSettingChange("clearCacheOnEnable")
	);
	elements.disableCacheForRedirects.addEventListener("change", () =>
		handleAdvancedSettingChange("disableCacheForRedirects")
	);

	// Action buttons
	elements.saveBtn.addEventListener("click", saveConfiguration);
	elements.clearCacheBtn.addEventListener("click", clearCache);
}

// Load configuration from storage
async function loadConfiguration() {
	try {
		const result = await browser.runtime.sendMessage({ action: "getConfig" });
		if (result) {
			config = { ...DEFAULT_CONFIG, ...result };
			// Ensure rules exist and have proper structure
			config = migrateConfig(config);
		}
		console.log("[JavaScript Proxy] Loaded configuration:", config);
	} catch (error) {
		console.error("[JavaScript Proxy] Error loading configuration:", error);
		showStatus("Error loading configuration: " + error.message, "error");
	}
}

// Migrate legacy configuration to new rules format
function migrateConfig(config) {
	// If rules don't exist, create them from legacy config
	if (!config.rules) {
		config.rules = {
			js: {
				enabled: true,
				pattern: config.urlPattern || DEFAULT_CONFIG.rules.js.pattern,
				redirectUrl: config.redirectUrl || DEFAULT_CONFIG.rules.js.redirectUrl,
				useCustomPattern: config.useCustomPattern || false,
			},
			css: {
				enabled: false,
				pattern: DEFAULT_CONFIG.rules.css.pattern,
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
				pattern: config.urlPattern || DEFAULT_CONFIG.rules.js.pattern,
				redirectUrl: config.redirectUrl || DEFAULT_CONFIG.rules.js.redirectUrl,
				useCustomPattern: config.useCustomPattern || false,
			};
		}
		if (!config.rules.css) {
			config.rules.css = {
				enabled: false,
				pattern: DEFAULT_CONFIG.rules.css.pattern,
				redirectUrl: "",
				returnBlank: false,
				useCustomPattern: false,
			};
		}
	}

	return config;
}

// Update UI based on current configuration
function updateUI() {
	// Update master toggle
	elements.masterToggle.checked = config.enabled;
	updateStatusInfo();

	// Update rule toggles
	elements.jsRuleToggle.checked = config.rules.js.enabled;
	elements.cssRuleToggle.checked = config.rules.css.enabled;

	// Update JavaScript rule fields
	elements.jsRedirectUrl.value = config.rules.js.redirectUrl || "";
	elements.jsUseCustomPattern.checked = config.rules.js.useCustomPattern;
	elements.jsPattern.value = config.rules.js.pattern || "";

	// Update CSS rule fields
	elements.cssRedirectUrl.value = config.rules.css.redirectUrl || "";
	elements.cssReturnBlank.checked = config.rules.css.returnBlank;
	elements.cssUseCustomPattern.checked = config.rules.css.useCustomPattern;
	elements.cssPattern.value = config.rules.css.pattern || "";

	// Update advanced settings
	elements.maskingMode.checked = config.maskingMode;
	elements.clearCacheOnEnable.checked = config.clearCacheOnEnable;
	elements.disableCacheForRedirects.checked = config.disableCacheForRedirects;

	// Update UI visibility and states
	updateRuleContainerStates();
	updatePatternVisibility("js");
	updatePatternVisibility("css");
	updateCssRedirectVisibility();
	updateSaveButtonState();
}

// Update status info text
function updateStatusInfo() {
	const activeRules = [];
	if (config.enabled) {
		if (config.rules.js.enabled) activeRules.push("JS redirects");
		if (config.rules.css.enabled) {
			if (config.rules.css.returnBlank) {
				activeRules.push("CSS blank returns");
			} else {
				activeRules.push("CSS redirects");
			}
		}
	}

	if (config.enabled && activeRules.length > 0) {
		elements.statusInfo.textContent = `Extension is active: ${activeRules.join(
			", "
		)}`;
	} else if (config.enabled) {
		elements.statusInfo.textContent =
			"Extension is enabled but no rules are active";
	} else {
		elements.statusInfo.textContent = "Extension is currently disabled";
	}
}

// Update rule container visual states
function updateRuleContainerStates() {
	// Disable rule containers when master toggle is off
	elements.jsRuleContainer.classList.toggle("disabled", !config.enabled);
	elements.cssRuleContainer.classList.toggle("disabled", !config.enabled);
}

// Update pattern field visibility for a rule
function updatePatternVisibility(ruleType) {
	const rule = config.rules[ruleType];
	const patternGroup = elements[`${ruleType}PatternGroup`];

	if (rule.useCustomPattern) {
		patternGroup.classList.remove("hidden");
	} else {
		patternGroup.classList.add("hidden");
	}
}

// Update CSS redirect URL visibility based on blank return setting
function updateCssRedirectVisibility() {
	if (config.rules.css.returnBlank) {
		elements.cssRedirectGroup.classList.add("hidden");
	} else {
		elements.cssRedirectGroup.classList.remove("hidden");
	}
}

// Update save button state
function updateSaveButtonState() {
	elements.saveBtn.disabled = !pendingChanges;
	elements.saveBtn.textContent = pendingChanges ? "Save Changes" : "No Changes";
}

// Handle master toggle change
async function handleMasterToggle() {
	const enabled = elements.masterToggle.checked;

	try {
		// Send toggle message to background script
		const response = await browser.runtime.sendMessage({
			action: "toggleProxy",
			enabled: enabled,
		});

		if (response && response.success) {
			config.enabled = enabled;
			updateUI();
			showStatus(
				enabled
					? "Extension enabled successfully"
					: "Extension disabled successfully",
				"success"
			);
		} else {
			throw new Error(response ? response.error : "Unknown error");
		}
	} catch (error) {
		console.error("[JavaScript Proxy] Error toggling proxy:", error);
		showStatus("Error toggling extension: " + error.message, "error");
		// Revert the toggle
		elements.masterToggle.checked = config.enabled;
	}
}

// Handle rule toggle change
function handleRuleToggle(ruleType) {
	const toggle = elements[`${ruleType}RuleToggle`];
	config.rules[ruleType].enabled = toggle.checked;
	setPendingChanges(true);
	updateUI();
}

// Handle field changes
function handleFieldChange(ruleType, fieldName) {
	const element =
		elements[
			`${ruleType}${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`
		];
	config.rules[ruleType][fieldName] = element.value;
	setPendingChanges(true);
	updateUI();
}

// Handle custom pattern toggle
function handleCustomPatternToggle(ruleType) {
	const toggle = elements[`${ruleType}UseCustomPattern`];
	config.rules[ruleType].useCustomPattern = toggle.checked;
	setPendingChanges(true);
	updatePatternVisibility(ruleType);
	updateSaveButtonState();
}

// Handle CSS blank return toggle
function handleCssBlankToggle() {
	config.rules.css.returnBlank = elements.cssReturnBlank.checked;
	setPendingChanges(true);
	updateCssRedirectVisibility();
	updateUI();
}

// Handle advanced setting changes
function handleAdvancedSettingChange(settingName) {
	config[settingName] = elements[settingName].checked;
	setPendingChanges(true);
	updateSaveButtonState();
}

// Toggle advanced settings panel
function toggleAdvancedSettings() {
	const isHidden = elements.advancedContent.classList.contains("hidden");

	if (isHidden) {
		elements.advancedContent.classList.remove("hidden");
		elements.advancedToggle.textContent = "Hide ▲";
	} else {
		elements.advancedContent.classList.add("hidden");
		elements.advancedToggle.textContent = "Show ▼";
	}
}

// Set pending changes state
function setPendingChanges(hasPendingChanges) {
	pendingChanges = hasPendingChanges;
	updateSaveButtonState();
}

// Validate configuration
function validateConfig() {
	const errors = [];

	// Check JavaScript rule
	if (config.rules.js.enabled) {
		if (!config.rules.js.redirectUrl) {
			errors.push(
				"JavaScript redirect URL is required when JS rule is enabled"
			);
		} else {
			try {
				new URL(config.rules.js.redirectUrl);
			} catch (e) {
				errors.push("JavaScript redirect URL is not valid");
			}
		}

		if (config.rules.js.useCustomPattern && !config.rules.js.pattern) {
			errors.push(
				"JavaScript custom pattern is required when custom pattern is enabled"
			);
		}

		if (config.rules.js.pattern) {
			try {
				new RegExp(config.rules.js.pattern);
			} catch (e) {
				errors.push("JavaScript URL pattern is not a valid regular expression");
			}
		}
	}

	// Check CSS rule
	if (config.rules.css.enabled) {
		if (!config.rules.css.returnBlank && !config.rules.css.redirectUrl) {
			errors.push(
				"CSS redirect URL is required when CSS rule is enabled and not returning blank"
			);
		}

		if (config.rules.css.redirectUrl) {
			try {
				new URL(config.rules.css.redirectUrl);
			} catch (e) {
				errors.push("CSS redirect URL is not valid");
			}
		}

		if (config.rules.css.useCustomPattern && !config.rules.css.pattern) {
			errors.push(
				"CSS custom pattern is required when custom pattern is enabled"
			);
		}

		if (config.rules.css.pattern) {
			try {
				new RegExp(config.rules.css.pattern);
			} catch (e) {
				errors.push("CSS URL pattern is not a valid regular expression");
			}
		}
	}

	return errors;
}

// Save configuration
async function saveConfiguration() {
	if (!pendingChanges) return;

	try {
		// Validate configuration
		const errors = validateConfig();
		if (errors.length > 0) {
			showStatus("Validation errors: " + errors.join(", "), "error");
			return;
		}

		// Disable save button during save
		elements.saveBtn.disabled = true;
		elements.saveBtn.textContent = "Saving...";

		// Send configuration to background script
		const response = await browser.runtime.sendMessage({
			action: "updateConfig",
			config: config,
		});

		if (response && response.success) {
			setPendingChanges(false);
			showStatus("Configuration saved successfully", "success");
		} else {
			throw new Error(response ? response.error : "Unknown error");
		}
	} catch (error) {
		console.error("[JavaScript Proxy] Error saving configuration:", error);
		showStatus("Error saving configuration: " + error.message, "error");
	} finally {
		updateSaveButtonState();
	}
}

// Clear cache
async function clearCache() {
	try {
		elements.clearCacheBtn.disabled = true;
		elements.clearCacheBtn.textContent = "Clearing...";

		const response = await browser.runtime.sendMessage({
			action: "clearCache",
		});

		if (response && response.success) {
			showStatus("Cache cleared successfully", "success");
		} else {
			throw new Error(response ? response.error : "Unknown error");
		}
	} catch (error) {
		console.error("[JavaScript Proxy] Error clearing cache:", error);
		showStatus("Error clearing cache: " + error.message, "error");
	} finally {
		elements.clearCacheBtn.disabled = false;
		elements.clearCacheBtn.textContent = "Clear Cache";
	}
}

// Show status message
function showStatus(message, type = "success") {
	elements.statusMessage.textContent = message;
	elements.statusMessage.className = `status-message status-${type}`;
	elements.statusMessage.classList.remove("hidden");

	// Auto-hide after 5 seconds
	setTimeout(() => {
		elements.statusMessage.classList.add("hidden");
	}, 5000);
}
