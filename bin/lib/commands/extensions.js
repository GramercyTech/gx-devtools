/**
 * Extensions Command
 *
 * Manages browser extensions for Firefox and Chrome.
 */

const path = require("path");
const fs = require("fs");
const shell = require("shelljs");
const { findProjectRoot, resolveGxPaths } = require("../utils");

/**
 * Launch Firefox with extension command
 */
function extensionFirefoxCommand() {
	const projectPath = findProjectRoot();
	let extensionPath = path.join(projectPath, "browser-extensions", "firefox");

	// If local extension doesn't exist, try to use the toolkit's own extensions
	if (!fs.existsSync(extensionPath)) {
		const paths = resolveGxPaths();
		const toolkitExtensionPath = path.join(
			paths.packageRoot,
			"browser-extensions",
			"firefox"
		);

		if (fs.existsSync(toolkitExtensionPath)) {
			console.log("🔍 Using GxToolkit's built-in Firefox extension");
			extensionPath = toolkitExtensionPath;
		} else {
			console.error("❌ Firefox extension directory not found");
			console.log(
				"📁 Looking for extensions in:",
				path.join(projectPath, "browser-extensions", "firefox")
			);
			console.log(
				"💡 Run 'gxdev init' to create a project with browser extensions"
			);
			process.exit(1);
		}
	} else {
		console.log("🔍 Using project's Firefox extension");
	}

	console.log("🦊 Launching Firefox with extension...");
	console.log("📁 Extension path:", extensionPath);
	shell.exec(`pnpm exec web-ext run --source-dir "${extensionPath}"`);
}

/**
 * Launch Chrome with extension command
 */
function extensionChromeCommand() {
	const projectPath = findProjectRoot();
	let extensionPath = path.join(projectPath, "browser-extensions", "chrome");
	let scriptPath = path.join(projectPath, "scripts", "launch-chrome.js");

	// Check if we have a local extension first
	if (!fs.existsSync(extensionPath)) {
		const paths = resolveGxPaths();
		const toolkitExtensionPath = path.join(
			paths.packageRoot,
			"browser-extensions",
			"chrome"
		);

		if (fs.existsSync(toolkitExtensionPath)) {
			console.log("🔍 Using GxToolkit's built-in Chrome extension");
			extensionPath = toolkitExtensionPath;
			// Use the toolkit's script instead
			scriptPath = path.join(paths.packageRoot, "scripts", "launch-chrome.js");
		} else {
			console.error("❌ Chrome extension directory not found");
			console.log(
				"📁 Looking for extensions in:",
				path.join(projectPath, "browser-extensions", "chrome")
			);
			console.log(
				"💡 Run 'gxdev init' to create a project with browser extensions"
			);
			process.exit(1);
		}
	} else {
		console.log("🔍 Using project's Chrome extension");
	}

	// Verify script exists
	if (!fs.existsSync(scriptPath)) {
		console.error(
			"❌ Chrome launcher script not found. Run 'gxdev init' to create it."
		);
		process.exit(1);
	}

	console.log("🚀 Launching Chrome with extension...");
	console.log("📁 Extension path:", extensionPath);

	// Set the extension path as an environment variable for the script
	process.env.CHROME_EXTENSION_PATH = extensionPath;
	shell.exec(`node "${scriptPath}"`);
}

/**
 * Install extension permanently in local browser
 */
function extensionInstallCommand(argv) {
	const browser = argv.browser;
	const paths = resolveGxPaths();

	if (!browser || !["chrome", "firefox"].includes(browser)) {
		console.log("Usage: gxdev ext:install <chrome|firefox>");
		console.log("");
		console.log("This command helps you permanently install the extension");
		console.log("in your local browser for development.");
		process.exit(1);
	}

	const extensionPath = path.join(
		paths.packageRoot,
		"browser-extensions",
		browser
	);

	if (!fs.existsSync(extensionPath)) {
		console.error(
			`❌ ${browser} extension directory not found at:`,
			extensionPath
		);
		process.exit(1);
	}

	console.log("");
	console.log(`📦 Extension path: ${extensionPath}`);
	console.log("");

	if (browser === "chrome") {
		console.log("🚀 Chrome Permanent Installation Instructions:");
		console.log("─".repeat(50));
		console.log("");
		console.log("1. Open Chrome and navigate to:");
		console.log("   chrome://extensions/");
		console.log("");
		console.log('2. Enable "Developer mode" (toggle in top right corner)');
		console.log("");
		console.log('3. Click "Load unpacked" button');
		console.log("");
		console.log("4. Select this directory:");
		console.log(`   ${extensionPath}`);
		console.log("");
		console.log("─".repeat(50));
		console.log("✅ The extension will persist across browser restarts.");
		console.log("🔄 After code changes, click the refresh icon on the");
		console.log("   extension card in chrome://extensions/ to reload.");
		console.log("");

		// Try to open Chrome to the extensions page
		const openCommand =
			process.platform === "darwin"
				? 'open -a "Google Chrome" "chrome://extensions/"'
				: process.platform === "win32"
				? 'start chrome "chrome://extensions/"'
				: 'google-chrome "chrome://extensions/"';

		console.log("🌐 Attempting to open Chrome extensions page...");
		shell.exec(openCommand, { silent: true });
	} else if (browser === "firefox") {
		console.log("🦊 Firefox Installation Instructions:");
		console.log("─".repeat(50));
		console.log("");
		console.log("Option 1: Temporary Add-on (easiest, but doesn't persist)");
		console.log("─".repeat(50));
		console.log("1. Open Firefox and navigate to:");
		console.log("   about:debugging#/runtime/this-firefox");
		console.log("");
		console.log('2. Click "Load Temporary Add-on..."');
		console.log("");
		console.log("3. Select any file in this directory:");
		console.log(`   ${extensionPath}`);
		console.log("");
		console.log("⚠️  Note: Temporary add-ons are removed when Firefox closes.");
		console.log("");
		console.log("─".repeat(50));
		console.log(
			"Option 2: Persistent Installation (Firefox Developer/Nightly)"
		);
		console.log("─".repeat(50));
		console.log("1. Use Firefox Developer Edition or Firefox Nightly");
		console.log("");
		console.log("2. Go to about:config and set:");
		console.log("   xpinstall.signatures.required = false");
		console.log("");
		console.log("3. Then go to about:addons");
		console.log("");
		console.log("4. Click the gear icon and select:");
		console.log('   "Install Add-on From File..."');
		console.log("");
		console.log("5. Select the manifest.json in:");
		console.log(`   ${extensionPath}`);
		console.log("");

		// Try to open Firefox to the debugging page
		const openCommand =
			process.platform === "darwin"
				? 'open -a "Firefox" "about:debugging#/runtime/this-firefox"'
				: process.platform === "win32"
				? 'start firefox "about:debugging#/runtime/this-firefox"'
				: 'firefox "about:debugging#/runtime/this-firefox"';

		console.log("🌐 Attempting to open Firefox debugging page...");
		shell.exec(openCommand, { silent: true });
	}
}

/**
 * Build extensions command
 */
function extensionBuildCommand() {
	const projectPath = findProjectRoot();
	const paths = resolveGxPaths();

	console.log("📦 Building browser extensions...");

	// Build Firefox extension
	let firefoxPath = path.join(projectPath, "browser-extensions", "firefox");
	let useProjectExtensions = true;

	if (!fs.existsSync(firefoxPath)) {
		// Try toolkit's extensions
		const toolkitFirefoxPath = path.join(
			paths.packageRoot,
			"browser-extensions",
			"firefox"
		);
		if (fs.existsSync(toolkitFirefoxPath)) {
			firefoxPath = toolkitFirefoxPath;
			useProjectExtensions = false;
			console.log("🔍 Using GxToolkit's built-in Firefox extension");
		}
	}

	if (fs.existsSync(firefoxPath)) {
		console.log("🦊 Building Firefox extension...");
		const outputDir = useProjectExtensions
			? "dist/firefox"
			: path.join(projectPath, "dist/firefox");
		shell.exec(
			`pnpm exec web-ext build --source-dir "${firefoxPath}" --artifacts-dir "${outputDir}"`
		);
	} else {
		console.log("⚠️ No Firefox extension found to build");
	}

	// Build Chrome extension
	let chromeScriptPath = path.join(projectPath, "scripts", "pack-chrome.js");
	let chromeExtensionPath = path.join(
		projectPath,
		"browser-extensions",
		"chrome"
	);

	if (!fs.existsSync(chromeScriptPath) || !fs.existsSync(chromeExtensionPath)) {
		// Try toolkit's scripts and extensions
		const toolkitScriptPath = path.join(
			paths.packageRoot,
			"scripts",
			"pack-chrome.js"
		);
		const toolkitChromePath = path.join(
			paths.packageRoot,
			"browser-extensions",
			"chrome"
		);

		if (fs.existsSync(toolkitScriptPath) && fs.existsSync(toolkitChromePath)) {
			chromeScriptPath = toolkitScriptPath;
			chromeExtensionPath = toolkitChromePath;
			console.log("🔍 Using GxToolkit's built-in Chrome extension");
		}
	}

	if (fs.existsSync(chromeScriptPath)) {
		console.log("🚀 Building Chrome extension...");
		// Set environment variable for the script to know where the extension is
		process.env.CHROME_EXTENSION_PATH = chromeExtensionPath;
		process.env.CHROME_BUILD_OUTPUT = path.join(projectPath, "dist/chrome");
		shell.exec(`node "${chromeScriptPath}"`);
	} else {
		console.log("⚠️ No Chrome extension found to build");
	}
}

module.exports = {
	extensionFirefoxCommand,
	extensionChromeCommand,
	extensionBuildCommand,
	extensionInstallCommand,
};
