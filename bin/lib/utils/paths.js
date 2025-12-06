/**
 * Path Resolution Utilities
 *
 * Handles finding project roots and resolving paths to toolkit resources.
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const { isWin, PACKAGE_NAME } = require("../constants");

/**
 * Determines the correct binary name based on platform and architecture
 */
function getBinaryName() {
	if (isWin) return "gento-win";
	if (process.arch === "x64") return "gento-darwin-amd64";
	return "gento";
}

/**
 * Finds the project root directory by looking for package.json
 */
function findProjectRoot() {
	let currentDir = process.cwd();

	while (currentDir !== path.dirname(currentDir)) {
		if (fs.existsSync(path.join(currentDir, "package.json"))) {
			return currentDir;
		}
		currentDir = path.dirname(currentDir);
	}

	return process.cwd(); // Fallback to current directory
}

/**
 * Resolves paths for gx-toolkit resources based on installation context
 *
 * Directory structure:
 * - /template/     - Files copied to new projects during init
 * - /runtime/      - Files used from node_modules (not copied to projects)
 * - /socket-events/ - Socket event templates
 */
function resolveGxPaths() {
	const projectRoot = findProjectRoot();

	// Try local installation first
	const localNodeModules = path.join(projectRoot, "node_modules", PACKAGE_NAME);
	if (fs.existsSync(localNodeModules)) {
		return {
			gentoPath: path.join(localNodeModules, "bin", getBinaryName()),
			viteConfigPath: path.join(localNodeModules, "runtime", "vite.config.js"),
			templateDir: path.join(localNodeModules, "template"),
			runtimeDir: path.join(localNodeModules, "runtime"),
			socketEventsDir: path.join(localNodeModules, "socket-events"),
			packageRoot: localNodeModules,
			// Legacy alias for backward compatibility
			configDir: path.join(localNodeModules, "template"),
		};
	}

	// Try global installation (or running from the toolkit itself)
	const globalNodeModules = path.join(__dirname, "..", "..", "..");
	return {
		gentoPath: path.join(globalNodeModules, "bin", getBinaryName()),
		viteConfigPath: path.join(globalNodeModules, "runtime", "vite.config.js"),
		templateDir: path.join(globalNodeModules, "template"),
		runtimeDir: path.join(globalNodeModules, "runtime"),
		socketEventsDir: path.join(globalNodeModules, "socket-events"),
		packageRoot: globalNodeModules,
		// Legacy alias for backward compatibility
		configDir: path.join(globalNodeModules, "template"),
	};
}

/**
 * Resolves file path checking local project first, then package
 *
 * @param {string} fileName - The file to find
 * @param {string} subDir - Subdirectory within the search locations
 * @param {string} packageLocation - Which package directory to check: 'template', 'runtime', or 'socket-events'
 */
function resolveFilePath(fileName, subDir = "", packageLocation = "template") {
	const projectRoot = findProjectRoot();
	const paths = resolveGxPaths();

	// Check local project first
	const localPath = path.join(projectRoot, subDir, fileName);
	if (fs.existsSync(localPath)) {
		return { path: localPath, isLocal: true };
	}

	// Determine which package directory to check
	let packageDir;
	switch (packageLocation) {
		case "runtime":
			packageDir = paths.runtimeDir;
			break;
		case "socket-events":
			packageDir = paths.socketEventsDir;
			break;
		default:
			packageDir = paths.templateDir;
	}

	// Fall back to package version
	const packagePath = path.join(packageDir, subDir, fileName);
	if (fs.existsSync(packagePath)) {
		return { path: packagePath, isLocal: false };
	}

	// Return package path even if doesn't exist (for error handling)
	return { path: packagePath, isLocal: false };
}

/**
 * Loads global configuration if available
 */
function loadGlobalConfig() {
	const globalConfigPath = path.join(os.homedir(), "gxtk-default-config.json");
	if (fs.existsSync(globalConfigPath)) {
		try {
			return JSON.parse(fs.readFileSync(globalConfigPath, "utf-8"));
		} catch (error) {
			console.warn("Warning: Could not parse global configuration");
		}
	}
	return {};
}

module.exports = {
	getBinaryName,
	findProjectRoot,
	resolveGxPaths,
	resolveFilePath,
	loadGlobalConfig,
};
