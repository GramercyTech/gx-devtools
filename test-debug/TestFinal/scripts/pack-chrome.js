#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const shell = require("shelljs");

/**
 * Packages Chrome extension into a distributable format
 */
function packChromeExtension() {
	const extensionPath =
		process.env.CHROME_EXTENSION_PATH ||
		path.resolve(__dirname, "../browser-extensions/chrome");
	const distPath =
		process.env.CHROME_BUILD_OUTPUT ||
		path.resolve(__dirname, "../dist/chrome");

	console.log("📦 Packaging Chrome extension...");

	// Verify extension directory exists
	if (!fs.existsSync(extensionPath)) {
		console.error("❌ Chrome extension directory not found:", extensionPath);
		process.exit(1);
	}

	// Create dist directory
	if (!fs.existsSync(distPath)) {
		fs.mkdirSync(distPath, { recursive: true });
	}

	// Read manifest to get version
	const manifestPath = path.join(extensionPath, "manifest.json");
	let version = "1.0.0";

	try {
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
		version = manifest.version || "1.0.0";
		console.log(`📋 Extension version: ${version}`);
	} catch (error) {
		console.warn("⚠️ Could not read manifest version, using default");
	}

	// Create zip file
	const zipName = `gx-chrome-extension-v${version}.zip`;
	const zipPath = path.join(distPath, zipName);

	console.log("🗜️ Creating zip archive...");

	// Change to extension directory and create zip
	const currentDir = process.cwd();

	try {
		process.chdir(extensionPath);

		// Remove existing zip if it exists
		if (fs.existsSync(zipPath)) {
			fs.unlinkSync(zipPath);
		}

		// Create zip using native zip command (works on macOS/Linux)
		const result = shell.exec(
			`zip -r "${zipPath}" . -x "*.DS_Store" "*.git*" "node_modules/*"`,
			{ silent: true }
		);

		if (result.code === 0) {
			console.log("✅ Chrome extension packaged successfully!");
			console.log("📁 Package location:", zipPath);
			console.log("");
			console.log("📋 Manual installation instructions:");
			console.log("1. Open Chrome and go to chrome://extensions/");
			console.log('2. Enable "Developer mode" (toggle in top right)');
			console.log('3. Click "Load unpacked" and select:', extensionPath);
			console.log("4. Or drag and drop the zip file to install");
		} else {
			console.error("❌ Failed to create zip archive");
			process.exit(1);
		}
	} catch (error) {
		console.error("❌ Error packaging extension:", error.message);
		process.exit(1);
	} finally {
		process.chdir(currentDir);
	}
}

if (require.main === module) {
	packChromeExtension();
}

module.exports = packChromeExtension;
