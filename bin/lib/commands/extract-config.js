/**
 * Extract Config Command
 *
 * Scans source files for GxP store usage and directives,
 * then generates/updates app-manifest.json with extracted configuration.
 */

const path = require("path");
const fs = require("fs");
const {
	findProjectRoot,
	extractConfigFromSource,
	mergeConfig,
	generateSummary,
} = require("../utils");

/**
 * Main extract-config command handler
 * @param {Object} argv - Yargs arguments
 */
async function extractConfigCommand(argv) {
	const projectPath = findProjectRoot();
	const srcDir = path.join(projectPath, "src");
	const manifestPath = path.join(projectPath, "app-manifest.json");

	const dryRun = argv.dryRun || argv["dry-run"] || false;
	const overwrite = argv.overwrite || false;
	const verbose = argv.verbose || false;

	console.log("🔍 Scanning source files for GxP configuration...");
	console.log(`   Project: ${projectPath}`);
	console.log(`   Source: ${srcDir}`);
	console.log("");

	// Check if src directory exists
	if (!fs.existsSync(srcDir)) {
		console.error("❌ Source directory not found: src/");
		console.log("   Make sure you are in a GxP project directory.");
		return;
	}

	// Extract configuration from source files
	const extractedConfig = extractConfigFromSource(srcDir);

	// Show summary of what was found
	const summary = generateSummary(extractedConfig);
	console.log(summary);

	// Check if anything was extracted
	const totalItems =
		Object.keys(extractedConfig.strings).length +
		Object.keys(extractedConfig.settings).length +
		Object.keys(extractedConfig.assets).length +
		Object.keys(extractedConfig.triggerState).length +
		extractedConfig.dependencies.length;

	if (totalItems === 0) {
		console.log("ℹ️  No GxP configuration found in source files.");
		console.log("");
		console.log("💡 Tips:");
		console.log("   - Use store.getString('key', 'default') in your components");
		console.log("   - Use gxp-string directive: <span gxp-string=\"key\">default</span>");
		console.log("   - Use gxp-src directive: <img gxp-src=\"key\" src=\"/default.jpg\" />");
		return;
	}

	if (dryRun) {
		console.log("🔸 Dry run mode - no changes will be made.");
		console.log("");
		console.log("To apply changes, run without --dry-run flag:");
		console.log("   gxdev extract-config");
		return;
	}

	// Load existing manifest or create new one
	let existingManifest = {};
	if (fs.existsSync(manifestPath)) {
		try {
			existingManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
			if (verbose) {
				console.log("📄 Found existing app-manifest.json");
			}
		} catch (error) {
			console.warn("⚠ Could not parse existing app-manifest.json, creating new one");
			existingManifest = getDefaultManifest();
		}
	} else {
		console.log("📄 Creating new app-manifest.json");
		existingManifest = getDefaultManifest();
	}

	// Merge extracted config into manifest
	const mergedManifest = mergeConfig(existingManifest, extractedConfig, {
		overwrite,
	});

	// Write updated manifest
	try {
		fs.writeFileSync(manifestPath, JSON.stringify(mergedManifest, null, "\t"));
		console.log("✅ Updated app-manifest.json");

		if (verbose) {
			console.log("");
			console.log("📋 Changes applied:");
			logChanges(existingManifest, mergedManifest, extractedConfig);
		}
	} catch (error) {
		console.error("❌ Error writing app-manifest.json:", error.message);
	}
}

/**
 * Get default manifest structure
 * @returns {Object} Default manifest
 */
function getDefaultManifest() {
	return {
		name: "GxToolkit",
		version: "1.0.0",
		description: "GxToolkit Plugin",
		manifest_version: 3,
		asset_dir: "/src/assets/",
		configurationFile: "configuration.json",
		appInstructionsFile: "app-instructions.md",
		defaultStylingFile: "default-styling.css",
		settings: {},
		strings: {
			default: {},
		},
		assets: {},
		triggerState: {},
		dependencies: [],
		permissions: [],
	};
}

/**
 * Log what changes were made
 * @param {Object} oldManifest - Original manifest
 * @param {Object} newManifest - Updated manifest
 * @param {Object} extracted - Extracted configuration
 */
function logChanges(oldManifest, newManifest, extracted) {
	const oldStrings = oldManifest.strings?.default || {};
	const newStrings = newManifest.strings?.default || {};

	// Count new additions
	let addedStrings = 0;
	let addedSettings = 0;
	let addedAssets = 0;
	let addedState = 0;
	let addedDeps = 0;

	for (const key of Object.keys(extracted.strings)) {
		if (!oldStrings[key]) addedStrings++;
	}

	for (const key of Object.keys(extracted.settings)) {
		if (oldManifest.settings?.[key] === undefined) addedSettings++;
	}

	for (const key of Object.keys(extracted.assets)) {
		if (!oldManifest.assets?.[key]) addedAssets++;
	}

	for (const key of Object.keys(extracted.triggerState)) {
		if (oldManifest.triggerState?.[key] === undefined) addedState++;
	}

	for (const dep of extracted.dependencies) {
		const exists = (oldManifest.dependencies || []).some(
			(d) => d.identifier === dep.identifier
		);
		if (!exists) addedDeps++;
	}

	if (addedStrings > 0) console.log(`   + ${addedStrings} new string(s)`);
	if (addedSettings > 0) console.log(`   + ${addedSettings} new setting(s)`);
	if (addedAssets > 0) console.log(`   + ${addedAssets} new asset(s)`);
	if (addedState > 0) console.log(`   + ${addedState} new state value(s)`);
	if (addedDeps > 0) console.log(`   + ${addedDeps} new dependency(ies)`);
}

module.exports = {
	extractConfigCommand,
};
