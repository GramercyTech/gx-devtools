/**
 * Extract Config Utility
 *
 * Parses Vue/JS files in src/ directory to extract GxP store usage and directives,
 * then generates/updates app-manifest.json with the extracted configuration.
 *
 * Extracts:
 * - getString(key, default) -> strings.default
 * - getSetting(key, default) -> settings
 * - getAsset(key, default) -> assets
 * - getState(key, default) -> triggerState
 * - callApi(path, identifier) -> dependencies
 * - listenSocket(socketName, event, callback) -> (tracked for reference)
 * - gxp-string/v-gxp-string directives -> strings.default
 * - gxp-setting/v-gxp-setting + gxp-string -> settings
 * - gxp-asset/v-gxp-asset + gxp-string -> assets
 * - gxp-state/v-gxp-state + gxp-string -> triggerState
 * - gxp-src/v-gxp-src -> assets
 */

const fs = require("fs");
const path = require("path");

/**
 * Extract configuration from all Vue/JS files in the src directory
 * @param {string} srcDir - Path to the src directory
 * @returns {Object} Extracted configuration
 */
function extractConfigFromSource(srcDir) {
	const config = {
		strings: {},
		settings: {},
		assets: {},
		triggerState: {},
		dependencies: [],
	};

	if (!fs.existsSync(srcDir)) {
		console.error(`❌ Source directory not found: ${srcDir}`);
		return config;
	}

	// Find all .vue and .js files recursively
	const files = findFilesRecursive(srcDir, [".vue", ".js", ".ts", ".jsx", ".tsx"]);

	for (const file of files) {
		try {
			const content = fs.readFileSync(file, "utf-8");
			const relativePath = path.relative(srcDir, file);

			// Extract from JavaScript/TypeScript code
			extractFromScript(content, config, relativePath);

			// Extract from Vue templates
			if (file.endsWith(".vue")) {
				extractFromTemplate(content, config, relativePath);
			}
		} catch (error) {
			console.warn(`⚠ Could not parse ${file}: ${error.message}`);
		}
	}

	return config;
}

/**
 * Find files recursively with given extensions
 * @param {string} dir - Directory to search
 * @param {string[]} extensions - File extensions to match
 * @returns {string[]} Array of file paths
 */
function findFilesRecursive(dir, extensions) {
	const files = [];

	function walk(currentDir) {
		const entries = fs.readdirSync(currentDir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(currentDir, entry.name);

			if (entry.isDirectory()) {
				// Skip node_modules and hidden directories
				if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
					walk(fullPath);
				}
			} else if (entry.isFile()) {
				const ext = path.extname(entry.name).toLowerCase();
				if (extensions.includes(ext)) {
					files.push(fullPath);
				}
			}
		}
	}

	walk(dir);
	return files;
}

/**
 * Extract store method calls from JavaScript/TypeScript code
 * @param {string} content - File content
 * @param {Object} config - Configuration object to populate
 * @param {string} sourcePath - Source file path for logging
 */
function extractFromScript(content, config, sourcePath) {
	// Extract getString calls: getString('key', 'default') or getString("key", "default")
	const getStringRegex = /\.getString\s*\(\s*['"`]([^'"`]+)['"`]\s*(?:,\s*['"`]([^'"`]*)['"`])?\s*\)/g;
	let match;
	while ((match = getStringRegex.exec(content)) !== null) {
		const key = match[1];
		const defaultValue = match[2] || "";
		if (!config.strings[key]) {
			config.strings[key] = defaultValue;
		}
	}

	// Extract getSetting calls: getSetting('key', 'default') or getSetting('key', value)
	const getSettingRegex = /\.getSetting\s*\(\s*['"`]([^'"`]+)['"`]\s*(?:,\s*['"`]?([^'"`),]*)['"`]?)?\s*\)/g;
	while ((match = getSettingRegex.exec(content)) !== null) {
		const key = match[1];
		let defaultValue = match[2] || "";
		// Clean up the default value
		defaultValue = defaultValue.trim();
		// Try to parse as JSON for non-string values
		if (defaultValue && !config.settings[key]) {
			try {
				config.settings[key] = JSON.parse(defaultValue);
			} catch {
				config.settings[key] = defaultValue;
			}
		} else if (!config.settings[key]) {
			config.settings[key] = "";
		}
	}

	// Extract getAsset calls: getAsset('key', 'default')
	const getAssetRegex = /\.getAsset\s*\(\s*['"`]([^'"`]+)['"`]\s*(?:,\s*['"`]([^'"`]*)['"`])?\s*\)/g;
	while ((match = getAssetRegex.exec(content)) !== null) {
		const key = match[1];
		const defaultValue = match[2] || "";
		if (!config.assets[key]) {
			config.assets[key] = defaultValue;
		}
	}

	// Extract getState calls: getState('key', default)
	const getStateRegex = /\.getState\s*\(\s*['"`]([^'"`]+)['"`]\s*(?:,\s*['"`]?([^'"`),]*)['"`]?)?\s*\)/g;
	while ((match = getStateRegex.exec(content)) !== null) {
		const key = match[1];
		let defaultValue = match[2] || "";
		defaultValue = defaultValue.trim();
		if (!config.triggerState[key]) {
			try {
				config.triggerState[key] = JSON.parse(defaultValue);
			} catch {
				config.triggerState[key] = defaultValue || null;
			}
		}
	}

	// Extract callApi calls: callApi('path', 'identifier') or apiGet/apiPost with identifier patterns
	// Pattern: callApi('/path', 'identifier') or any api method with path
	const callApiRegex = /\.(?:callApi|apiGet|apiPost|apiPut|apiPatch|apiDelete)\s*\(\s*['"`]([^'"`]+)['"`]\s*(?:,\s*['"`]([^'"`]+)['"`])?\s*\)/g;
	while ((match = callApiRegex.exec(content)) !== null) {
		const apiPath = match[1];
		const identifier = match[2];
		if (identifier) {
			// Check if this dependency already exists
			const exists = config.dependencies.some(
				(dep) => dep.identifier === identifier && dep.path === apiPath
			);
			if (!exists) {
				config.dependencies.push({
					identifier: identifier,
					path: apiPath,
				});
			}
		}
	}

	// Extract listenSocket calls for reference: listenSocket('socketName', 'event', callback)
	// These help identify what socket events the app expects
	const listenSocketRegex = /\.(?:listenSocket|useSocketListener)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]/g;
	while ((match = listenSocketRegex.exec(content)) !== null) {
		const socketName = match[1];
		const eventName = match[2];
		// Add as a dependency reference if not 'primary'
		if (socketName !== "primary") {
			const exists = config.dependencies.some(
				(dep) => dep.identifier === socketName
			);
			if (!exists) {
				config.dependencies.push({
					identifier: socketName,
					path: "",
					events: { [eventName]: eventName },
				});
			} else {
				// Add the event to existing dependency
				const dep = config.dependencies.find((d) => d.identifier === socketName);
				if (dep) {
					dep.events = dep.events || {};
					dep.events[eventName] = eventName;
				}
			}
		}
	}
}

/**
 * Extract directive usage from Vue templates
 * @param {string} content - File content
 * @param {Object} config - Configuration object to populate
 * @param {string} sourcePath - Source file path for logging
 */
function extractFromTemplate(content, config, sourcePath) {
	// Extract template section
	const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
	if (!templateMatch) {
		return;
	}

	const template = templateMatch[1];

	// Extract gxp-string/v-gxp-string without other gxp attributes (pure strings)
	// Pattern: <tag gxp-string="key">default</tag> or <tag v-gxp-string="'key'">default</tag>
	// But NOT when gxp-setting, gxp-asset, or gxp-state is present
	const pureStringRegex = /<([a-z][a-z0-9-]*)\s+[^>]*(?:v-gxp-string|gxp-string)=["']([^"']+)["'][^>]*>([^<]*)</gi;
	let match;
	while ((match = pureStringRegex.exec(template)) !== null) {
		const fullMatch = match[0];
		const key = match[2].replace(/['"]/g, ""); // Remove quotes for v-gxp-string="'key'"
		const defaultValue = match[3].trim();

		// Check if this element has gxp-setting, gxp-asset, or gxp-state
		const hasGxpSetting = /gxp-setting|v-gxp-setting/i.test(fullMatch);
		const hasGxpAsset = /gxp-asset|v-gxp-asset/i.test(fullMatch);
		const hasGxpState = /gxp-state|v-gxp-state/i.test(fullMatch);

		if (hasGxpSetting) {
			// gxp-string key with gxp-setting -> settings
			if (!config.settings[key]) {
				config.settings[key] = defaultValue;
			}
		} else if (hasGxpAsset) {
			// gxp-string key with gxp-asset -> assets
			if (!config.assets[key]) {
				config.assets[key] = defaultValue;
			}
		} else if (hasGxpState) {
			// gxp-string key with gxp-state -> triggerState
			if (!config.triggerState[key]) {
				config.triggerState[key] = defaultValue || null;
			}
		} else {
			// Pure gxp-string -> strings
			if (!config.strings[key]) {
				config.strings[key] = defaultValue;
			}
		}
	}

	// Extract standalone gxp-setting/v-gxp-setting with value (not using gxp-string for key)
	// Pattern: <tag gxp-setting="key">default</tag>
	const settingRegex = /<([a-z][a-z0-9-]*)\s+[^>]*(?:v-gxp-setting|gxp-setting)=["']([^"']+)["'][^>]*>([^<]*)</gi;
	while ((match = settingRegex.exec(template)) !== null) {
		const key = match[2].replace(/['"]/g, "");
		const defaultValue = match[3].trim();
		// Only add if key looks like an actual key (not empty)
		if (key && !config.settings[key]) {
			config.settings[key] = defaultValue;
		}
	}

	// Extract standalone gxp-asset/v-gxp-asset with value
	const assetRegex = /<([a-z][a-z0-9-]*)\s+[^>]*(?:v-gxp-asset|gxp-asset)=["']([^"']+)["'][^>]*>([^<]*)</gi;
	while ((match = assetRegex.exec(template)) !== null) {
		const key = match[2].replace(/['"]/g, "");
		const defaultValue = match[3].trim();
		if (key && !config.assets[key]) {
			config.assets[key] = defaultValue;
		}
	}

	// Extract gxp-src/v-gxp-src: <img gxp-src="key" src="default" />
	// Pattern matches self-closing and regular tags with gxp-src and src attributes
	const gxpSrcRegex = /<([a-z][a-z0-9-]*)\s+[^>]*(?:v-gxp-src|gxp-src)=["']([^"']+)["'][^>]*src=["']([^"']+)["'][^>]*\/?>/gi;
	while ((match = gxpSrcRegex.exec(template)) !== null) {
		const key = match[2].replace(/['"]/g, "");
		const defaultSrc = match[3];

		// Check if gxp-state is present
		const fullMatch = match[0];
		const hasGxpState = /gxp-state|v-gxp-state/i.test(fullMatch);

		if (hasGxpState) {
			if (!config.triggerState[key]) {
				config.triggerState[key] = defaultSrc;
			}
		} else {
			if (!config.assets[key]) {
				config.assets[key] = defaultSrc;
			}
		}
	}

	// Also try reverse order: src before gxp-src
	const gxpSrcReverseRegex = /<([a-z][a-z0-9-]*)\s+[^>]*src=["']([^"']+)["'][^>]*(?:v-gxp-src|gxp-src)=["']([^"']+)["'][^>]*\/?>/gi;
	while ((match = gxpSrcReverseRegex.exec(template)) !== null) {
		const defaultSrc = match[2];
		const key = match[3].replace(/['"]/g, "");

		const fullMatch = match[0];
		const hasGxpState = /gxp-state|v-gxp-state/i.test(fullMatch);

		if (hasGxpState) {
			if (!config.triggerState[key]) {
				config.triggerState[key] = defaultSrc;
			}
		} else {
			if (!config.assets[key]) {
				config.assets[key] = defaultSrc;
			}
		}
	}
}

/**
 * Merge extracted config into existing manifest
 * @param {Object} existingManifest - Current app-manifest.json content
 * @param {Object} extractedConfig - Newly extracted configuration
 * @param {Object} options - Merge options
 * @returns {Object} Merged manifest
 */
function mergeConfig(existingManifest, extractedConfig, options = {}) {
	const { overwrite = false } = options;

	const merged = { ...existingManifest };

	// Ensure nested structures exist
	if (!merged.strings) merged.strings = {};
	if (!merged.strings.default) merged.strings.default = {};
	if (!merged.settings) merged.settings = {};
	if (!merged.assets) merged.assets = {};
	if (!merged.triggerState) merged.triggerState = {};
	if (!merged.dependencies) merged.dependencies = [];

	// Merge strings
	for (const [key, value] of Object.entries(extractedConfig.strings)) {
		if (overwrite || !merged.strings.default[key]) {
			merged.strings.default[key] = value;
		}
	}

	// Merge settings
	for (const [key, value] of Object.entries(extractedConfig.settings)) {
		if (overwrite || merged.settings[key] === undefined) {
			merged.settings[key] = value;
		}
	}

	// Merge assets
	for (const [key, value] of Object.entries(extractedConfig.assets)) {
		if (overwrite || !merged.assets[key]) {
			merged.assets[key] = value;
		}
	}

	// Merge triggerState
	for (const [key, value] of Object.entries(extractedConfig.triggerState)) {
		if (overwrite || merged.triggerState[key] === undefined) {
			merged.triggerState[key] = value;
		}
	}

	// Merge dependencies (by identifier)
	for (const dep of extractedConfig.dependencies) {
		const existingIndex = merged.dependencies.findIndex(
			(d) => d.identifier === dep.identifier
		);
		if (existingIndex === -1) {
			merged.dependencies.push(dep);
		} else if (overwrite) {
			merged.dependencies[existingIndex] = {
				...merged.dependencies[existingIndex],
				...dep,
			};
		}
	}

	return merged;
}

/**
 * Generate a summary of extracted configuration
 * @param {Object} config - Extracted configuration
 * @returns {string} Summary text
 */
function generateSummary(config) {
	const lines = [];

	const stringCount = Object.keys(config.strings).length;
	const settingCount = Object.keys(config.settings).length;
	const assetCount = Object.keys(config.assets).length;
	const stateCount = Object.keys(config.triggerState).length;
	const depCount = config.dependencies.length;

	lines.push("📊 Extraction Summary:");
	lines.push("");

	if (stringCount > 0) {
		lines.push(`📝 Strings (${stringCount}):`);
		for (const [key, value] of Object.entries(config.strings)) {
			const displayValue = value ? `"${value}"` : "(empty)";
			lines.push(`   ${key}: ${displayValue}`);
		}
		lines.push("");
	}

	if (settingCount > 0) {
		lines.push(`⚙️  Settings (${settingCount}):`);
		for (const [key, value] of Object.entries(config.settings)) {
			lines.push(`   ${key}: ${JSON.stringify(value)}`);
		}
		lines.push("");
	}

	if (assetCount > 0) {
		lines.push(`🖼️  Assets (${assetCount}):`);
		for (const [key, value] of Object.entries(config.assets)) {
			lines.push(`   ${key}: ${value || "(empty)"}`);
		}
		lines.push("");
	}

	if (stateCount > 0) {
		lines.push(`🔄 Trigger State (${stateCount}):`);
		for (const [key, value] of Object.entries(config.triggerState)) {
			lines.push(`   ${key}: ${JSON.stringify(value)}`);
		}
		lines.push("");
	}

	if (depCount > 0) {
		lines.push(`🔗 Dependencies (${depCount}):`);
		for (const dep of config.dependencies) {
			lines.push(`   ${dep.identifier}: ${dep.path || "(no path)"}`);
			if (dep.events) {
				lines.push(`      Events: ${Object.keys(dep.events).join(", ")}`);
			}
		}
		lines.push("");
	}

	if (stringCount + settingCount + assetCount + stateCount + depCount === 0) {
		lines.push("   No configuration found in source files.");
		lines.push("");
	}

	return lines.join("\n");
}

module.exports = {
	extractConfigFromSource,
	mergeConfig,
	generateSummary,
	findFilesRecursive,
};
