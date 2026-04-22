/**
 * Build Command
 *
 * Builds the plugin for production and packages it as a .gxp file.
 */

const path = require("path")
const fs = require("fs")
const shell = require("shelljs")
const AdmZip = require("adm-zip")
const { findProjectRoot, resolveGxPaths } = require("../utils")

/**
 * Get the plugin name from app-manifest.json (preferred) or package.json
 */
function getPluginName(projectPath) {
	// Check app-manifest.json first
	try {
		const manifestPath = path.join(projectPath, "app-manifest.json")
		if (fs.existsSync(manifestPath)) {
			const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
			if (manifest.name) {
				return manifest.name.replace(/[^a-zA-Z0-9-_]/g, "-")
			}
		}
	} catch (error) {
		console.warn(
			"Could not read app-manifest.json, falling back to package.json",
		)
	}

	// Fall back to package.json
	try {
		const packageJsonPath = path.join(projectPath, "package.json")
		if (fs.existsSync(packageJsonPath)) {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"))
			// Clean the name for use as a filename
			const name = packageJson.name || "plugin"
			return name
				.replace(/^@[^/]+\//, "") // Remove scope like @company/
				.replace(/[^a-zA-Z0-9-_]/g, "-") // Replace invalid chars with dash
		}
	} catch (error) {
		console.warn("Could not read package.json, using default plugin name")
	}
	return "plugin"
}

/**
 * Package the built plugin into a .gxpapp file
 * @param {string} projectPath - Project root path
 * @param {string} buildPath - Path where built files are (dist/build/)
 * @param {string} outputPath - Path where .gxpapp file should be created (dist/)
 */
async function packagePlugin(projectPath, buildPath, outputPath) {
	const pluginName = getPluginName(projectPath)

	console.log("\n📦 Packaging plugin...")

	// Read app-manifest.json to get asset_dir
	const manifestPath = path.join(projectPath, "app-manifest.json")
	let assetDir = "/src/assets/" // Default

	if (fs.existsSync(manifestPath)) {
		try {
			const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
			if (manifest.asset_dir) {
				assetDir = manifest.asset_dir
			}
		} catch (error) {
			console.warn(
				"⚠️  Could not parse app-manifest.json, using default asset_dir",
			)
		}
	} else {
		console.warn("⚠️  app-manifest.json not found")
	}

	// Resolve asset directory path (remove leading slash for path.join)
	const assetDirClean = assetDir.replace(/^\//, "").replace(/\/$/, "")
	const assetSourcePath = path.join(projectPath, assetDirClean)
	const assetDestPath = path.join(buildPath, "assets")

	// Copy assets to dist/build/assets
	if (fs.existsSync(assetSourcePath)) {
		console.log(
			`📂 Copying assets from ${assetDirClean}/ to dist/build/assets/`,
		)

		// Create assets directory in build
		if (!fs.existsSync(assetDestPath)) {
			fs.mkdirSync(assetDestPath, { recursive: true })
		}

		// Copy all files from asset source to build/assets
		copyDirectorySync(assetSourcePath, assetDestPath)
		console.log("✓ Assets copied")
	} else {
		console.log(`ℹ️  No assets directory found at ${assetDirClean}/`)
	}

	// Process app-manifest.json for bundle
	let manifest = null
	if (fs.existsSync(manifestPath)) {
		// Parse manifest for optional bundle files
		try {
			manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
		} catch (error) {
			console.warn("⚠️  Could not parse app-manifest.json")
		}
	}

	// Process optional bundle files (appInstructions, defaultStyling, configuration)
	if (manifest) {
		processOptionalBundleFiles(manifest, projectPath, buildPath)

		// Create a clean copy of manifest without the optional file keys (to avoid duplication)
		const cleanedManifest = { ...manifest }
		delete cleanedManifest.appInstructionsFile
		delete cleanedManifest.appInstructions
		delete cleanedManifest.defaultStylingFile
		delete cleanedManifest.defaultStyling
		delete cleanedManifest.configurationFile
		delete cleanedManifest.configuration

		// Write cleaned manifest to dist/build/
		const manifestDestPath = path.join(buildPath, "app-manifest.json")
		fs.writeFileSync(
			manifestDestPath,
			JSON.stringify(cleanedManifest, null, 2),
			"utf-8",
		)
		console.log("✓ app-manifest.json written to dist/build/ (cleaned)")
	}

	// Create the .gxp package (zip file) in dist/
	const gxpFileName = `${pluginName}.gxpapp`
	const gxpFilePath = path.join(outputPath, gxpFileName)

	console.log(`📦 Creating ${gxpFileName}...`)

	await createGxpPackage(buildPath, gxpFilePath)

	console.log(`\n✅ Plugin packaged successfully!`)
	console.log(`📁 Build files: dist/build/`)
	console.log(`📁 Package: dist/${gxpFileName}`)

	return gxpFilePath
}

/**
 * Process optional bundle files from manifest (appInstructions, defaultStyling)
 * @param {object} manifest - Parsed app-manifest.json
 * @param {string} projectPath - Project root path
 * @param {string} buildPath - Path where built files are (dist/build/)
 */
function processOptionalBundleFiles(manifest, projectPath, buildPath) {
	// Handle appInstructions
	if (manifest.appInstructionsFile) {
		// Copy file from specified path
		const srcPath = path.join(projectPath, manifest.appInstructionsFile)
		const destPath = path.join(buildPath, "appInstructions.md")
		if (fs.existsSync(srcPath)) {
			fs.copyFileSync(srcPath, destPath)
			console.log(
				`✓ appInstructions.md copied from ${manifest.appInstructionsFile}`,
			)
		} else {
			console.warn(
				`⚠️  appInstructionsFile not found: ${manifest.appInstructionsFile}`,
			)
		}
	} else if (manifest.appInstructions) {
		// Write text content to file
		const destPath = path.join(buildPath, "appInstructions.md")
		fs.writeFileSync(destPath, manifest.appInstructions, "utf-8")
		console.log("✓ appInstructions.md created from manifest text")
	}

	// Handle defaultStyling
	if (manifest.defaultStylingFile) {
		// Copy file from specified path
		const srcPath = path.join(projectPath, manifest.defaultStylingFile)
		const destPath = path.join(buildPath, "default-styling.css")
		if (fs.existsSync(srcPath)) {
			fs.copyFileSync(srcPath, destPath)
			console.log(
				`✓ default-styling.css copied from ${manifest.defaultStylingFile}`,
			)
		} else {
			console.warn(
				`⚠️  defaultStylingFile not found: ${manifest.defaultStylingFile}`,
			)
		}
	} else if (manifest.defaultStyling) {
		// Write text content to file
		const destPath = path.join(buildPath, "default-styling.css")
		fs.writeFileSync(destPath, manifest.defaultStyling, "utf-8")
		console.log("✓ default-styling.css created from manifest text")
	}

	// Handle configuration
	if (manifest.configurationFile) {
		// Copy file from specified path
		const srcPath = path.join(projectPath, manifest.configurationFile)
		const destPath = path.join(buildPath, "configuration.json")
		if (fs.existsSync(srcPath)) {
			fs.copyFileSync(srcPath, destPath)
			console.log(
				`✓ configuration.json copied from ${manifest.configurationFile}`,
			)
		} else {
			console.warn(
				`⚠️  configurationFile not found: ${manifest.configurationFile}`,
			)
		}
	} else if (manifest.configuration) {
		// Write JSON content to file
		const destPath = path.join(buildPath, "configuration.json")
		const jsonContent =
			typeof manifest.configuration === "string"
				? manifest.configuration
				: JSON.stringify(manifest.configuration, null, 2)
		fs.writeFileSync(destPath, jsonContent, "utf-8")
		console.log("✓ configuration.json created from manifest JSON")
	}
}

/**
 * Recursively copy a directory
 */
function copyDirectorySync(src, dest) {
	if (!fs.existsSync(dest)) {
		fs.mkdirSync(dest, { recursive: true })
	}

	const entries = fs.readdirSync(src, { withFileTypes: true })

	for (const entry of entries) {
		const srcPath = path.join(src, entry.name)
		const destPath = path.join(dest, entry.name)

		// Skip .gitkeep files
		if (entry.name === ".gitkeep") continue

		if (entry.isDirectory()) {
			copyDirectorySync(srcPath, destPath)
		} else {
			fs.copyFileSync(srcPath, destPath)
		}
	}
}

/**
 * Create the .gxp package (zip file containing plugin files)
 */
async function createGxpPackage(distPath, outputPath) {
	const zip = new AdmZip()

	const addFileIfExists = (filePath, zipName) => {
		if (fs.existsSync(filePath)) {
			zip.addLocalFile(filePath, "", zipName)
		}
	}

	// Add all JS and CSS files from dist (flat, at zip root)
	for (const file of fs.readdirSync(distPath)) {
		if (file.endsWith(".js") || file.endsWith(".css")) {
			zip.addLocalFile(path.join(distPath, file))
		}
	}

	addFileIfExists(path.join(distPath, "app-manifest.json"), "app-manifest.json")

	// Add assets directory (recursive) under "assets/" in the zip
	const assetsPath = path.join(distPath, "assets")
	if (fs.existsSync(assetsPath)) {
		zip.addLocalFolder(assetsPath, "assets")
	}

	addFileIfExists(
		path.join(distPath, "appInstructions.md"),
		"appInstructions.md",
	)
	addFileIfExists(
		path.join(distPath, "default-styling.css"),
		"default-styling.css",
	)
	addFileIfExists(
		path.join(distPath, "configuration.json"),
		"configuration.json",
	)

	await zip.writeZipPromise(outputPath)

	const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(2)
	console.log(`✓ Package created (${sizeKB} KB)`)
}

/**
 * Build command - builds the plugin for production
 */
async function buildCommand(argv) {
	const projectPath = findProjectRoot()
	const paths = resolveGxPaths()
	const distPath = path.join(projectPath, "dist")
	const buildPath = path.join(distPath, "build")

	console.log("🔨 Building plugin...\n")

	// Vite config always comes from the runtime. Projects extend it via an
	// optional `vite.extend.js` at the project root.
	const viteConfigPath = paths.viteConfigPath

	// Set environment variables directly on process.env for cross-platform compatibility.
	// Using shell-level "export"/"set" syntax breaks on Windows due to cmd.exe quote parsing.
	if (!process.env.NODE_LOG_LEVEL) {
		process.env.NODE_LOG_LEVEL = argv["node-log-level"] || "error"
	}
	if (!process.env.COMPONENT_PATH) {
		process.env.COMPONENT_PATH = argv["component-path"] || "./src/Plugin.vue"
	}

	// Normalize path separators to forward slashes for cross-platform shell compatibility
	const normalizedViteConfigPath = viteConfigPath.replace(/\\/g, "/")
	const command = `npx vite build --config "${normalizedViteConfigPath}"`

	const result = shell.exec(command)

	// Only proceed with packaging if build succeeded
	if (result.code === 0) {
		try {
			// Move built files from dist/ to dist/build/
			await moveBuildFiles(distPath, buildPath)
			// Package the plugin (reads from buildPath, outputs .gxpapp to distPath)
			await packagePlugin(projectPath, buildPath, distPath)
		} catch (error) {
			console.error("❌ Error packaging plugin:", error.message)
			process.exit(1)
		}
	} else {
		console.error("❌ Build failed")
		process.exit(1)
	}
}

/**
 * Move built JS/CSS files from dist/ to dist/build/
 */
async function moveBuildFiles(distPath, buildPath) {
	// Create build directory
	if (!fs.existsSync(buildPath)) {
		fs.mkdirSync(buildPath, { recursive: true })
	}

	// Move all JS and CSS files to build directory
	const files = fs.readdirSync(distPath)
	for (const file of files) {
		if (file.endsWith(".js") || file.endsWith(".css")) {
			const srcFile = path.join(distPath, file)
			const destFile = path.join(buildPath, file)
			fs.renameSync(srcFile, destFile)
		}
	}
}

module.exports = {
	buildCommand,
}
