/**
 * File Utilities
 *
 * Handles file operations like safe copying and package.json management.
 */

const path = require("path")
const fs = require("fs")
const shell = require("shelljs")
const {
	REQUIRED_DEPENDENCIES,
	REQUIRED_DEV_DEPENDENCIES,
	DEFAULT_SCRIPTS,
} = require("../constants")
const { loadGlobalConfig } = require("./paths")

/**
 * Copies a file from source to destination, creating directories if needed
 * @param {string} src - Source file path
 * @param {string} dest - Destination file path
 * @param {string} description - Description for logging
 * @param {boolean} overwrite - If true, overwrite existing files
 */
function safeCopyFile(src, dest, description, overwrite = false) {
	const exists = fs.existsSync(dest)
	if (!exists || overwrite) {
		console.log(`${exists ? "Overwriting" : "Creating"} ${description}`)
		const destDir = path.dirname(dest)
		if (!fs.existsSync(destDir)) {
			fs.mkdirSync(destDir, { recursive: true })
		}
		fs.copyFileSync(src, dest)
	}
}

/**
 * Creates package.json for new projects
 * @param {string} projectPath - Path to project directory
 * @param {string} projectName - Name of the project
 * @param {string} description - Optional project description
 */
function createPackageJson(projectPath, projectName, description = "") {
	const packageJsonPath = path.join(projectPath, "package.json")
	const globalConfig = loadGlobalConfig()

	const packageJson = {
		name: projectName,
		version: "1.0.0",
		description: description || `GxP Plugin: ${projectName}`,
		main: "main.js",
		type: "module",
		scripts: {
			...DEFAULT_SCRIPTS,
			placeholder:
				"gxdev assets generate --size 400x300 --name custom-placeholder",
		},
		dependencies: REQUIRED_DEPENDENCIES,
		devDependencies: REQUIRED_DEV_DEPENDENCIES,
		author: globalConfig.author || "Your Name",
		license: "ISC",
	}

	fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
	console.log("✓ Created package.json")
}

/**
 * Updates app-manifest.json with project name and description
 * @param {string} projectPath - Path to project directory
 * @param {string} projectName - Name of the project
 * @param {string} description - Optional project description
 */
function updateAppManifest(projectPath, projectName, description = "") {
	const manifestPath = path.join(projectPath, "app-manifest.json")

	if (!fs.existsSync(manifestPath)) {
		console.warn("⚠ app-manifest.json not found, skipping update")
		return
	}

	try {
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))

		// Update name and description
		manifest.name = projectName
		if (description) {
			manifest.description = description
		} else {
			manifest.description = `GxP Plugin: ${projectName}`
		}

		// Update strings with project name
		if (manifest.strings && manifest.strings.default) {
			manifest.strings.default.welcome_text = `Welcome to ${projectName}`
		}

		fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, "\t"))
		console.log("✓ Updated app-manifest.json with project details")
	} catch (error) {
		console.warn("⚠ Could not update app-manifest.json:", error.message)
	}
}

/**
 * Installs npm dependencies
 */
function installDependencies(projectPath) {
	console.log("\n📦 Installing dependencies...")
	const currentDir = process.cwd()

	try {
		process.chdir(projectPath)
		const result = shell.exec("npm install", { silent: false })
		if (result.code !== 0) {
			console.warn("⚠ npm install completed with warnings")
		}
	} finally {
		process.chdir(currentDir)
	}
}

/**
 * Updates existing project's package.json with missing dependencies and scripts
 */
function updateExistingProject(projectPath) {
	const packageJsonPath = path.join(projectPath, "package.json")

	if (!fs.existsSync(packageJsonPath)) {
		return false
	}

	try {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"))
		let updated = false

		// Ensure "type": "module" so vite.extend.js (and other ESM files) don't
		// trigger Node's MODULE_TYPELESS_PACKAGE_JSON reparse warning.
		// Only set it if the field is missing — don't silently flip a project
		// that has explicitly chosen "commonjs".
		if (!packageJson.type) {
			packageJson.type = "module"
			console.log('  + Setting "type": "module"')
			updated = true
		}

		// Check and add/update dependencies
		if (!packageJson.dependencies) {
			packageJson.dependencies = {}
		}

		for (const [dep, version] of Object.entries(REQUIRED_DEPENDENCIES)) {
			const existingVersion = packageJson.dependencies[dep]
			if (!existingVersion) {
				packageJson.dependencies[dep] = version
				console.log(`  + Adding dependency: ${dep}@${version}`)
				updated = true
			} else if (existingVersion !== version) {
				packageJson.dependencies[dep] = version
				console.log(
					`  ↑ Updating dependency: ${dep} (${existingVersion} → ${version})`,
				)
				updated = true
			}
		}

		// Check and add/update dev dependencies
		if (!packageJson.devDependencies) {
			packageJson.devDependencies = {}
		}

		for (const [dep, version] of Object.entries(REQUIRED_DEV_DEPENDENCIES)) {
			const existingVersion = packageJson.devDependencies[dep]
			if (!existingVersion) {
				packageJson.devDependencies[dep] = version
				console.log(`  + Adding devDependency: ${dep}@${version}`)
				updated = true
			} else if (existingVersion !== version) {
				packageJson.devDependencies[dep] = version
				console.log(
					`  ↑ Updating devDependency: ${dep} (${existingVersion} → ${version})`,
				)
				updated = true
			}
		}

		// Check and add missing scripts
		if (!packageJson.scripts) {
			packageJson.scripts = {}
		}

		for (const [script, command] of Object.entries(DEFAULT_SCRIPTS)) {
			if (!packageJson.scripts[script]) {
				packageJson.scripts[script] = command
				console.log(`  + Adding script: ${script}`)
				updated = true
			}
		}

		if (updated) {
			fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
			console.log("✓ Updated package.json")
			return true
		}

		return false
	} catch (error) {
		console.error("Error updating package.json:", error.message)
		return false
	}
}

/**
 * Checks if ImageMagick is available globally
 */
function isImageMagickInstalled() {
	return shell.which("magick") !== null || shell.which("convert") !== null
}

/**
 * Ensures ImageMagick is available for placeholder generation
 */
function ensureImageMagickInstalled() {
	if (isImageMagickInstalled()) {
		console.log("✓ ImageMagick is available")
		return true
	}

	console.log("⚠️  ImageMagick not found")
	console.log("📦 ImageMagick is required for generating placeholder images")
	console.log("")
	console.log("🍎 macOS: brew install imagemagick")
	console.log("🐧 Ubuntu/Debian: sudo apt-get install imagemagick")
	console.log(
		"🟦 Windows: Download from https://imagemagick.org/script/download.php#windows",
	)
	console.log("")
	console.log("💡 After installation, you can generate placeholders with:")
	console.log("   gxdev assets generate --size 400x300 --name my-placeholder")
	console.log("   gxdev assets generate --name icons --count 3 --size 64x64")
	return false
}

module.exports = {
	safeCopyFile,
	createPackageJson,
	updateAppManifest,
	installDependencies,
	updateExistingProject,
	isImageMagickInstalled,
	ensureImageMagickInstalled,
}
