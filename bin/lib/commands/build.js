/**
 * Build Command
 *
 * Builds the plugin for production and packages it as a .gxp file.
 */

const path = require("path");
const fs = require("fs");
const shell = require("shelljs");
const archiver = require("archiver");
const { exportCmd } = require("../constants");
const { findProjectRoot, resolveGxPaths } = require("../utils");

/**
 * Get the plugin name from package.json
 */
function getPluginName(projectPath) {
	try {
		const packageJsonPath = path.join(projectPath, "package.json");
		if (fs.existsSync(packageJsonPath)) {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
			// Clean the name for use as a filename
			const name = packageJson.name || "plugin";
			return name
				.replace(/^@[^/]+\//, "") // Remove scope like @company/
				.replace(/[^a-zA-Z0-9-_]/g, "-"); // Replace invalid chars with dash
		}
	} catch (error) {
		console.warn("Could not read package.json, using default plugin name");
	}
	return "plugin";
}

/**
 * Package the built plugin into a .gxp file
 * @param {string} projectPath - Project root path
 * @param {string} buildPath - Path where built files are (dist/build/)
 * @param {string} outputPath - Path where .gxp file should be created (dist/)
 */
async function packagePlugin(projectPath, buildPath, outputPath) {
	const pluginName = getPluginName(projectPath);

	console.log("\n📦 Packaging plugin...");

	// Read app-manifest.json to get asset_dir
	const manifestPath = path.join(projectPath, "app-manifest.json");
	let assetDir = "/src/assets/"; // Default

	if (fs.existsSync(manifestPath)) {
		try {
			const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
			if (manifest.asset_dir) {
				assetDir = manifest.asset_dir;
			}
		} catch (error) {
			console.warn("⚠️  Could not parse app-manifest.json, using default asset_dir");
		}
	} else {
		console.warn("⚠️  app-manifest.json not found");
	}

	// Resolve asset directory path (remove leading slash for path.join)
	const assetDirClean = assetDir.replace(/^\//, "").replace(/\/$/, "");
	const assetSourcePath = path.join(projectPath, assetDirClean);
	const assetDestPath = path.join(buildPath, "assets");

	// Copy assets to dist/build/assets
	if (fs.existsSync(assetSourcePath)) {
		console.log(`📂 Copying assets from ${assetDirClean}/ to dist/build/assets/`);

		// Create assets directory in build
		if (!fs.existsSync(assetDestPath)) {
			fs.mkdirSync(assetDestPath, { recursive: true });
		}

		// Copy all files from asset source to build/assets
		copyDirectorySync(assetSourcePath, assetDestPath);
		console.log("✓ Assets copied");
	} else {
		console.log(`ℹ️  No assets directory found at ${assetDirClean}/`);
	}

	// Copy app-manifest.json to dist/build/
	if (fs.existsSync(manifestPath)) {
		const manifestDestPath = path.join(buildPath, "app-manifest.json");
		fs.copyFileSync(manifestPath, manifestDestPath);
		console.log("✓ app-manifest.json copied to dist/build/");
	}

	// Create the .gxp package (zip file) in dist/
	const gxpFileName = `${pluginName}.gxp`;
	const gxpFilePath = path.join(outputPath, gxpFileName);

	console.log(`📦 Creating ${gxpFileName}...`);

	await createGxpPackage(buildPath, gxpFilePath);

	console.log(`\n✅ Plugin packaged successfully!`);
	console.log(`📁 Build files: dist/build/`);
	console.log(`📁 Package: dist/${gxpFileName}`);

	return gxpFilePath;
}

/**
 * Recursively copy a directory
 */
function copyDirectorySync(src, dest) {
	if (!fs.existsSync(dest)) {
		fs.mkdirSync(dest, { recursive: true });
	}

	const entries = fs.readdirSync(src, { withFileTypes: true });

	for (const entry of entries) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);

		// Skip .gitkeep files
		if (entry.name === ".gitkeep") continue;

		if (entry.isDirectory()) {
			copyDirectorySync(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

/**
 * Create the .gxp package (zip file containing plugin files)
 */
function createGxpPackage(distPath, outputPath) {
	return new Promise((resolve, reject) => {
		const output = fs.createWriteStream(outputPath);
		const archive = archiver("zip", {
			zlib: { level: 9 } // Maximum compression
		});

		output.on("close", () => {
			const sizeKB = (archive.pointer() / 1024).toFixed(2);
			console.log(`✓ Package created (${sizeKB} KB)`);
			resolve();
		});

		archive.on("error", (err) => {
			reject(err);
		});

		archive.pipe(output);

		// Add all JS files from dist
		const jsFiles = fs.readdirSync(distPath).filter(f => f.endsWith(".js"));
		jsFiles.forEach(file => {
			archive.file(path.join(distPath, file), { name: file });
		});

		// Add all CSS files from dist
		const cssFiles = fs.readdirSync(distPath).filter(f => f.endsWith(".css"));
		cssFiles.forEach(file => {
			archive.file(path.join(distPath, file), { name: file });
		});

		// Add app-manifest.json
		const manifestPath = path.join(distPath, "app-manifest.json");
		if (fs.existsSync(manifestPath)) {
			archive.file(manifestPath, { name: "app-manifest.json" });
		}

		// Add assets directory
		const assetsPath = path.join(distPath, "assets");
		if (fs.existsSync(assetsPath)) {
			archive.directory(assetsPath, "assets");
		}

		archive.finalize();
	});
}

/**
 * Build command - builds the plugin for production
 */
async function buildCommand(argv) {
	const projectPath = findProjectRoot();
	const paths = resolveGxPaths();
	const distPath = path.join(projectPath, "dist");
	const buildPath = path.join(distPath, "build");

	console.log("🔨 Building plugin...\n");

	const envVars = [];

	// check if vite.config.js exists locally
	let viteConfigPath = paths.viteConfigPath;
	const localViteConfigPath = path.join(projectPath, "vite.config.js");
	if (fs.existsSync(localViteConfigPath)) {
		viteConfigPath = localViteConfigPath;
		console.log(`📁 Using local vite.config.js: ${viteConfigPath}`);
	}

	// Set variables only if not already defined in environment
	if (!process.env.NODE_LOG_LEVEL) {
		envVars.push(
			`${exportCmd} NODE_LOG_LEVEL=${argv["node-log-level"] || "error"}`
		);
	}
	if (!process.env.COMPONENT_PATH) {
		envVars.push(
			`${exportCmd} COMPONENT_PATH=${argv["component-path"] || "./src/Plugin.vue"}`
		);
	}

	const command = [
		...envVars,
		`npx vite build --config "${viteConfigPath}"`,
	].join(" && ");

	const result = shell.exec(command);

	// Only proceed with packaging if build succeeded
	if (result.code === 0) {
		try {
			// Move built files from dist/ to dist/build/
			await moveBuildFiles(distPath, buildPath);
			// Package the plugin (reads from buildPath, outputs .gxp to distPath)
			await packagePlugin(projectPath, buildPath, distPath);
		} catch (error) {
			console.error("❌ Error packaging plugin:", error.message);
			process.exit(1);
		}
	} else {
		console.error("❌ Build failed");
		process.exit(1);
	}
}

/**
 * Move built JS/CSS files from dist/ to dist/build/
 */
async function moveBuildFiles(distPath, buildPath) {
	// Create build directory
	if (!fs.existsSync(buildPath)) {
		fs.mkdirSync(buildPath, { recursive: true });
	}

	// Move all JS and CSS files to build directory
	const files = fs.readdirSync(distPath);
	for (const file of files) {
		if (file.endsWith(".js") || file.endsWith(".css")) {
			const srcFile = path.join(distPath, file);
			const destFile = path.join(buildPath, file);
			fs.renameSync(srcFile, destFile);
		}
	}
}

module.exports = {
	buildCommand,
};
