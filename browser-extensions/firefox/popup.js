document.addEventListener("DOMContentLoaded", async function () {
	const toggleButton = document.getElementById("toggleButton");
	const toggleText = document.getElementById("toggleText");
	const redirectUrlInput = document.getElementById("redirectUrl");
	const customPatternCheckbox = document.getElementById("customPattern");
	const patternDisplay = document.getElementById("patternDisplay");
	const customPatternInput = document.getElementById("customPatternInput");
	const saveButton = document.getElementById("saveButton");
	const statusDiv = document.getElementById("status");
	const maskingModeCheckbox = document.getElementById("maskingMode");

	// Default configuration
	const defaultConfig = {
		enabled: false,
		redirectUrl: "https://localhost:3060/src/Plugin.vue",
		urlPattern: "uploads\\/plugin-version\\/\\d+\\/file_name\\/.*\\.js(\\?.*)?",
		useCustomPattern: false,
		maskingMode: false,
	};

	// Load current configuration
	let config = {};
	try {
		const result = await browser.storage.sync.get(defaultConfig);
		config = result;
	} catch (error) {
		console.error("Error loading config:", error);
		config = defaultConfig;
	}

	// Initialize UI with loaded config
	updateUI();
	updatePatternDisplay();

	function updateUI() {
		// Update toggle button
		if (config.enabled) {
			toggleButton.classList.add("enabled");
			toggleText.textContent = "ON";
		} else {
			toggleButton.classList.remove("enabled");
			toggleText.textContent = "OFF";
		}

		// Update form fields
		redirectUrlInput.value = config.redirectUrl || defaultConfig.redirectUrl;
		customPatternCheckbox.checked = config.useCustomPattern || false;
		customPatternInput.value = config.urlPattern || defaultConfig.urlPattern;
		maskingModeCheckbox.checked = config.maskingMode || false;

		// Toggle custom pattern input visibility
		if (config.useCustomPattern) {
			customPatternInput.classList.add("visible");
			patternDisplay.style.display = "none";
		} else {
			customPatternInput.classList.remove("visible");
			patternDisplay.style.display = "block";
		}
	}

	function updatePatternDisplay() {
		const pattern = config.useCustomPattern
			? config.urlPattern
			: defaultConfig.urlPattern;
		patternDisplay.textContent = pattern;
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
			return "Redirect URL is required";
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
		if (!url.includes("://")) {
			return "https://" + url;
		}
		return url;
	}

	// Event listeners
	toggleButton.addEventListener("click", async function () {
		config.enabled = !config.enabled;

		try {
			await browser.storage.sync.set({ enabled: config.enabled });
			updateUI();

			// Send message to background script
			browser.runtime.sendMessage({
				action: "toggleProxy",
				enabled: config.enabled,
			});

			showStatus(config.enabled ? "Proxy enabled" : "Proxy disabled");
		} catch (error) {
			console.error("Error toggling proxy:", error);
			showStatus("Error toggling proxy", false);
		}
	});

	customPatternCheckbox.addEventListener("change", function () {
		config.useCustomPattern = this.checked;
		updateUI();
		updatePatternDisplay();
	});

	maskingModeCheckbox.addEventListener("change", function () {
		config.maskingMode = this.checked;
	});

	saveButton.addEventListener("click", async function () {
		const redirectUrl = redirectUrlInput.value.trim();
		const urlPattern = config.useCustomPattern
			? customPatternInput.value.trim()
			: defaultConfig.urlPattern;

		// Validate inputs
		const redirectUrlError = validateRedirectUrl(redirectUrl);
		if (redirectUrlError) {
			showStatus(redirectUrlError, false);
			return;
		}

		const patternError = validatePattern(urlPattern);
		if (patternError) {
			showStatus(patternError, false);
			return;
		}

		// Update config
		config.redirectUrl = normalizeUrl(redirectUrl);
		config.urlPattern = urlPattern;
		config.useCustomPattern = customPatternCheckbox.checked;
		config.maskingMode = maskingModeCheckbox.checked;

		try {
			await browser.storage.sync.set(config);

			// Send updated config to background script
			browser.runtime.sendMessage({
				action: "updateConfig",
				config: config,
			});

			updateUI();
			updatePatternDisplay();
			showStatus("Configuration saved successfully");
		} catch (error) {
			console.error("Error saving config:", error);
			showStatus("Error saving configuration", false);
		}
	});

	// Send initial config to background script
	browser.runtime.sendMessage({
		action: "updateConfig",
		config: config,
	});
});
