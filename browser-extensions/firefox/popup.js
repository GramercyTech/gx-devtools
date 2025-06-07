document.addEventListener("DOMContentLoaded", async function () {
	const toggleButton = document.getElementById("toggleButton");
	const toggleText = document.getElementById("toggleText");
	const saveButton = document.getElementById("saveButton");
	const status = document.getElementById("status");
	const maskingMode = document.getElementById("maskingMode");
	const redirectUrl = document.getElementById("redirectUrl");
	const customPattern = document.getElementById("customPattern");
	const patternDisplay = document.getElementById("patternDisplay");
	const customPatternInput = document.getElementById("customPatternInput");
	const currentDomainDisplay = document.getElementById("currentDomain");

	let currentState = { enabled: false, rules: [] };
	let currentTabUrl = "";

	// Load current state and tab info
	try {
		const response = await browser.runtime.sendMessage({ action: "getState" });
		currentState = response;

		// Get current tab URL
		const tabs = await browser.tabs.query({
			active: true,
			currentWindow: true,
		});
		if (tabs[0]) {
			currentTabUrl = tabs[0].url;
		}

		updateUI();
		loadConfiguration();
	} catch (error) {
		console.error("Failed to load state:", error);
	}

	// Toggle proxy
	toggleButton.addEventListener("click", async function () {
		try {
			const response = await browser.runtime.sendMessage({
				action: "toggleProxy",
			});
			currentState.enabled = response.enabled;
			updateUI();
			showStatus(
				"Proxy " + (response.enabled ? "enabled" : "disabled"),
				"success"
			);
		} catch (error) {
			console.error("Failed to toggle proxy:", error);
			showStatus("Error toggling proxy", "error");
		}
	});

	// Toggle masking mode
	maskingMode.addEventListener("change", async function () {
		try {
			const response = await browser.runtime.sendMessage({
				action: "setMaskingMode",
				enabled: maskingMode.checked,
			});
			showStatus(
				maskingMode.checked ? "Masking mode enabled" : "Masking mode disabled",
				"success"
			);
		} catch (error) {
			console.error("Failed to toggle masking mode:", error);
		}
	});

	// Toggle custom pattern
	customPattern.addEventListener("change", function () {
		updatePatternDisplay();
	});

	// Update pattern when custom input changes
	customPatternInput.addEventListener("input", function () {
		if (customPattern.checked) {
			updatePatternDisplay();
		}
	});

	// Save configuration
	saveButton.addEventListener("click", async function () {
		await saveConfiguration();
	});

	// Update UI based on current state
	function updateUI() {
		if (currentState.enabled) {
			toggleButton.classList.add("enabled");
			toggleText.textContent = "ON";
		} else {
			toggleButton.classList.remove("enabled");
			toggleText.textContent = "OFF";
		}
	}

	// Load existing configuration
	function loadConfiguration() {
		// Display current domain info
		if (currentTabUrl) {
			try {
				const url = new URL(currentTabUrl);
				currentDomainDisplay.textContent = `Current domain: ${url.hostname}`;
			} catch (error) {
				currentDomainDisplay.textContent = "No active domain detected";
			}
		}

		// Load existing rule if any
		if (currentState.rules && currentState.rules.length > 0) {
			const rule = currentState.rules[0]; // Use first rule
			redirectUrl.value = rule.redirect || "";

			// Check if it's using default pattern or custom
			const defaultPattern = generateDefaultPattern();
			if (rule.pattern === defaultPattern) {
				customPattern.checked = false;
			} else {
				customPattern.checked = true;
				customPatternInput.value = rule.pattern;
			}
		}

		updatePatternDisplay();
	}

	// Generate default pattern based on current domain
	function generateDefaultPattern() {
		if (!currentTabUrl) return "";

		try {
			const url = new URL(currentTabUrl);
			const hostname = url.hostname;

			// For complex domains like "zenith-develop.env.eventfinity.app",
			// we want to extract the main domain structure
			const parts = hostname.split(".");
			let targetDomain = hostname;

			// Handle different domain structures:
			// Remove the first subdomain to get the base domain pattern
			// e.g., westernightwall.zenith-develop.env.eventfinity.app -> zenith-develop.env.eventfinity.app
			if (parts.length >= 2) {
				targetDomain = parts.slice(1).join(".");
			}

			// Escape dots for regex and create pattern that matches any subdomain
			// Include optional query parameters after .js for signed URLs
			// Match both /uploads/versions/ and /uploads/plugin-version/ paths
			const escapedDomain = targetDomain.replace(/\./g, "\\.");
			return `.*\\.${escapedDomain}\\/uploads\\/(plugin-version|versions)\\/\\d+\\/file_name\\/.*\\.js(\\?.*)?`;
		} catch (error) {
			console.error("Error generating default pattern:", error);
			return "";
		}
	}

	// Update pattern display
	function updatePatternDisplay() {
		if (customPattern.checked) {
			patternDisplay.style.display = "none";
			customPatternInput.classList.add("visible");
			customPatternInput.placeholder =
				currentTabUrl || "Enter custom regex pattern";
		} else {
			patternDisplay.style.display = "block";
			customPatternInput.classList.remove("visible");

			const defaultPattern = generateDefaultPattern();
			if (defaultPattern) {
				patternDisplay.textContent = defaultPattern;
			} else {
				patternDisplay.textContent =
					"No pattern available - please enable proxy on a valid domain";
			}
		}
	}

	// Save configuration
	async function saveConfiguration() {
		try {
			const redirectTo = redirectUrl.value.trim();

			if (!redirectTo) {
				showStatus("Please enter a redirect URL", "error");
				return;
			}

			// Validate redirect URL - allow both full URLs and hostname:port/path
			let validatedRedirectTo = redirectTo;
			try {
				new URL(redirectTo);
			} catch (e) {
				// Try adding https:// prefix
				try {
					new URL(`https://${redirectTo}`);
					validatedRedirectTo = redirectTo; // Keep original for background script to handle
				} catch (e2) {
					showStatus("Please enter a valid URL", "error");
					return;
				}
			}

			// Get pattern
			let pattern;
			if (customPattern.checked) {
				pattern = customPatternInput.value.trim();
				if (!pattern) {
					showStatus("Please enter a custom pattern", "error");
					return;
				}
			} else {
				pattern = generateDefaultPattern();
				if (!pattern) {
					showStatus(
						"Unable to generate pattern - please check current domain",
						"error"
					);
					return;
				}
			}

			// Validate regex pattern
			try {
				new RegExp(pattern);
			} catch (e) {
				showStatus("Invalid regex pattern: " + e.message, "error");
				return;
			}

			// Create rule
			const rule = {
				pattern: pattern,
				redirect: validatedRedirectTo,
				maskUrl: false, // Default to false, can be controlled by masking mode
			};

			// Save to background script
			const response = await browser.runtime.sendMessage({
				action: "updateRules",
				rules: [rule], // Single rule array
			});

			if (response.success) {
				currentState.rules = [rule];
				showStatus("Configuration saved successfully!", "success");
			} else {
				showStatus("Error saving configuration", "error");
			}
		} catch (error) {
			console.error("Failed to save configuration:", error);
			showStatus("Error saving configuration", "error");
		}
	}

	// Show status message
	function showStatus(message, type = "success") {
		status.textContent = message;
		status.className = `status ${type}`;
		status.style.display = "block";

		setTimeout(() => {
			status.style.display = "none";
		}, 3000);
	}

	// Initialize pattern display
	updatePatternDisplay();
});
