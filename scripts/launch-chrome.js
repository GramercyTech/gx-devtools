#!/usr/bin/env node

const chromeLauncher = require("chrome-launcher");
const path = require("path");
const fs = require("fs");

/**
 * Launches Chrome with the browser extension loaded
 */
async function launchChromeWithExtension() {
	const extensionPath = path.resolve(__dirname, "../browser-extensions/chrome");

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

	console.log("🚀 Launching Chrome with extension...");
	console.log("📁 Extension path:", extensionPath);

	try {
		const chrome = await chromeLauncher.launch({
			chromeFlags: [
				`--load-extension=${extensionPath}`,
				"--disable-web-security",
				"--disable-features=VizDisplayCompositor",
				"--user-data-dir=/tmp/chrome-extension-test",
				"--new-window",
			],
			startingUrl: "chrome://extensions/",
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
