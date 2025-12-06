/**
 * File Utilities
 *
 * Handles file operations like safe copying and package.json management.
 */

const path = require("path");
const fs = require("fs");
const shell = require("shelljs");
const {
	REQUIRED_DEPENDENCIES,
	REQUIRED_DEV_DEPENDENCIES,
	DEFAULT_SCRIPTS,
} = require("../constants");
const { loadGlobalConfig } = require("./paths");

/**
 * Copies a file from source to destination, creating directories if needed
 */
function safeCopyFile(src, dest, description) {
	if (!fs.existsSync(dest)) {
		console.log(`Creating ${description}`);
		const destDir = path.dirname(dest);
		if (!fs.existsSync(destDir)) {
			fs.mkdirSync(destDir, { recursive: true });
		}
		fs.copyFileSync(src, dest);
	}
}

/**
 * Creates package.json for new projects
 */
function createPackageJson(projectPath, projectName) {
	const packageJsonPath = path.join(projectPath, "package.json");
	const globalConfig = loadGlobalConfig();

	const packageJson = {
		name: projectName,
		version: "1.0.0",
		description: `GxP Plugin: ${projectName}`,
		main: "main.js",
		scripts: {
			...DEFAULT_SCRIPTS,
			placeholder: "gxtk assets generate --size 400x300 --name custom-placeholder",
		},
		dependencies: REQUIRED_DEPENDENCIES,
		devDependencies: REQUIRED_DEV_DEPENDENCIES,
		author: globalConfig.author || "Your Name",
		license: "ISC",
	};

	fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
	console.log("✓ Created package.json");
}

/**
 * Installs npm dependencies
 */
function installDependencies(projectPath) {
	console.log("\n📦 Installing dependencies...");
	const currentDir = process.cwd();

	try {
		process.chdir(projectPath);
		const result = shell.exec("npm install", { silent: false });
		if (result.code !== 0) {
			console.warn("⚠ npm install completed with warnings");
		}
	} finally {
		process.chdir(currentDir);
	}
}

/**
 * Updates existing project's package.json with missing dependencies and scripts
 */
function updateExistingProject(projectPath) {
	const packageJsonPath = path.join(projectPath, "package.json");

	if (!fs.existsSync(packageJsonPath)) {
		return false;
	}

	try {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
		let updated = false;

		// Check and add missing dependencies
		if (!packageJson.dependencies) {
			packageJson.dependencies = {};
		}

		for (const [dep, version] of Object.entries(REQUIRED_DEPENDENCIES)) {
			if (!packageJson.dependencies[dep]) {
				packageJson.dependencies[dep] = version;
				console.log(`  + Adding dependency: ${dep}@${version}`);
				updated = true;
			}
		}

		// Check and add missing dev dependencies
		if (!packageJson.devDependencies) {
			packageJson.devDependencies = {};
		}

		for (const [dep, version] of Object.entries(REQUIRED_DEV_DEPENDENCIES)) {
			if (!packageJson.devDependencies[dep]) {
				packageJson.devDependencies[dep] = version;
				console.log(`  + Adding devDependency: ${dep}@${version}`);
				updated = true;
			}
		}

		// Check and add missing scripts
		if (!packageJson.scripts) {
			packageJson.scripts = {};
		}

		for (const [script, command] of Object.entries(DEFAULT_SCRIPTS)) {
			if (!packageJson.scripts[script]) {
				packageJson.scripts[script] = command;
				console.log(`  + Adding script: ${script}`);
				updated = true;
			}
		}

		if (updated) {
			fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
			console.log("✓ Updated package.json");
			return true;
		}

		return false;
	} catch (error) {
		console.error("Error updating package.json:", error.message);
		return false;
	}
}

/**
 * Checks if ImageMagick is available globally
 */
function isImageMagickInstalled() {
	return shell.which("magick") !== null || shell.which("convert") !== null;
}

/**
 * Ensures ImageMagick is available for placeholder generation
 */
function ensureImageMagickInstalled() {
	if (isImageMagickInstalled()) {
		console.log("✓ ImageMagick is available");
		return true;
	}

	console.log("⚠️  ImageMagick not found");
	console.log("📦 ImageMagick is required for generating placeholder images");
	console.log("");
	console.log("🍎 macOS: brew install imagemagick");
	console.log("🐧 Ubuntu/Debian: sudo apt-get install imagemagick");
	console.log(
		"🟦 Windows: Download from https://imagemagick.org/script/download.php#windows"
	);
	console.log("");
	console.log("💡 After installation, you can generate placeholders with:");
	console.log("   gxtk assets generate --size 400x300 --name my-placeholder");
	console.log("   gxtk assets generate --name icons --count 3 --size 64x64");
	return false;
}

module.exports = {
	safeCopyFile,
	createPackageJson,
	installDependencies,
	updateExistingProject,
	isImageMagickInstalled,
	ensureImageMagickInstalled,
};
