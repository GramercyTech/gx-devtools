#!/usr/bin/env node

const path = require("path");
const fs = require("fs");

/**
 * Get the dev server URL from environment variables
 * @returns {string} The URL to open in the browser
 */
function getDevServerUrl() {
	// Check for explicit START_URL first
	if (process.env.START_URL) {
		return process.env.START_URL;
	}

	// Build URL from environment variables
	const useHttps = process.env.USE_HTTPS !== "false";
	const protocol = useHttps ? "https" : "http";
	const port = process.env.NODE_PORT || 3060;

	return `${protocol}://localhost:${port}`;
}

/**
 * Generate extension defaults based on environment variables
 * This creates a defaults.json file that the popup.js reads on load
 */
function generateExtensionDefaults(extensionPath) {
	const useHttps = process.env.USE_HTTPS !== "false";
	const protocol = useHttps ? "https" : "http";
	const port = process.env.NODE_PORT || 3060;
	const baseUrl = `${protocol}://localhost:${port}`;

	const defaults = {
		// Extension should be enabled by default when launched from CLI
		enabled: true,
		// JS redirect URL based on env
		jsRedirectUrl: `${baseUrl}/src/Plugin.vue`,
		// CSS redirect URL (empty by default, uses blank CSS)
		cssRedirectUrl: "",
		// CSS override should be enabled by default
		cssRuleEnabled: true,
		// Return blank CSS by default
		cssReturnBlank: true,
		// Use custom URL pattern by default
		jsUseCustomPattern: true,
		cssUseCustomPattern: true,
		// Cache settings
		clearCacheOnEnable: true,
		disableCacheForRedirects: true,
	};

	const defaultsPath = path.join(extensionPath, "defaults.json");
	fs.writeFileSync(defaultsPath, JSON.stringify(defaults, null, 2));
	console.log("📝 Generated extension defaults:", defaultsPath);

	return defaults;
}

/**
 * Launches Chrome with the browser extension loaded
 */
async function launchChromeWithExtension() {
	// Dynamic import for chrome-launcher (ES module)
	const { launch } = await import("chrome-launcher");
	// Use environment variable if set (from CLI), otherwise use default path
	const extensionPath =
		process.env.CHROME_EXTENSION_PATH ||
		path.resolve(__dirname, "../browser-extensions/chrome");

	// Verify extension directory exists
	if (!fs.existsSync(extensionPath)) {
		console.error("❌ Chrome extension directory not found:", extensionPath);
		process.exit(1);
	}

	// Verify manifest.json exists
	const manifestPath = path.join(extensionPath, "manifest.json");
	if (!fs.existsSync(manifestPath)) {
		console.error("❌ Chrome extension manifest.json not found");
		process.exit(1);
	}

	// Generate extension defaults based on environment
	generateExtensionDefaults(extensionPath);

	// Get the starting URL
	const startingUrl = getDevServerUrl();

	console.log("🚀 Launching Chrome with extension...");
	console.log("📁 Extension path:", extensionPath);
	console.log("🌐 Opening URL:", startingUrl);

	try {
		const chrome = await launch({
			chromeFlags: [
				`--load-extension=${extensionPath}`,
				"--disable-extensions-except=" + extensionPath,
				"--disable-extensions-file-access-check",
				"--user-data-dir=/tmp/chrome-extension-test",
				"--new-window",
				"--no-first-run",
				"--no-default-browser-check",
			],
			startingUrl: startingUrl,
		});

		console.log("✅ Chrome launched successfully!");
		console.log("🔧 Chrome debugging port:", chrome.port);
		console.log("📋 Extension should be loaded in developer mode");
		console.log("🌐 Navigate to chrome://extensions/ to see your extension");

		// Keep the process alive
		process.on("SIGINT", async () => {
			console.log("\n🛑 Shutting down Chrome...");
			await chrome.kill();
			process.exit(0);
		});
	} catch (error) {
		console.error("❌ Failed to launch Chrome:", error.message);
		process.exit(1);
	}
}

if (require.main === module) {
	launchChromeWithExtension();
}

module.exports = launchChromeWithExtension;
