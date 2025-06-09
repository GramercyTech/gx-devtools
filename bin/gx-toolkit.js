#!/usr/bin/env node

const yargs = require("yargs");
const shell = require("shelljs");
const path = require("path");
const fs = require("fs");
const os = require("os");
const readline = require("readline");
const dotenv = require("dotenv");

/**
 * GxToolkit CLI
 *
 * This tool works both as a globally installed npm package and as a local dependency.
 * It provides commands for creating new GxP projects and updating existing ones.
 */

// Platform-specific configurations
const isWin = process.platform === "win32";
const exportCmd = isWin ? "set" : "export";

// Required dependencies for GxP projects
const REQUIRED_DEPENDENCIES = {
	"@vitejs/plugin-vue": "^5.1.4",
	vite: "^5.4.8",
	vue: "^3.5.8",
	cors: "^2.8.5",
	express: "^4.21.0",
	"socket.io": "^4.8.0",
	"socket.io-client": "^4.8.0",
	dotenv: "^16.4.5",
	"@gramercytech/gx-componentkit": "^1.0.0",
};

// Dependencies for GxP projects with datastore
const REQUIRED_DATASTORE_DEPENDENCIES = {
	...REQUIRED_DEPENDENCIES,
	pinia: "^2.1.7",
	axios: "^1.6.0",
};

const REQUIRED_DEV_DEPENDENCIES = {
	"@gramercytech/gx-toolkit": "^1.0.58",
	nodemon: "^3.1.7",
	concurrently: "^9.0.1",
	mkcert: "^3.2.0",
};

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
 */
function resolveGxPaths() {
	const projectRoot = findProjectRoot();
	const packageName = "@gramercytech/gx-toolkit";

	// Try local installation first
	const localNodeModules = path.join(projectRoot, "node_modules", packageName);
	if (fs.existsSync(localNodeModules)) {
		return {
			gentoPath: path.join(localNodeModules, "bin", getBinaryName()),
			viteConfigPath: path.join(localNodeModules, "vite.config.js"),
			configDir: path.join(localNodeModules, "config"),
			packageRoot: localNodeModules,
		};
	}

	// Try global installation
	const globalNodeModules = path.join(__dirname, "..");
	return {
		gentoPath: path.join(globalNodeModules, "bin", getBinaryName()),
		viteConfigPath: path.join(globalNodeModules, "vite.config.js"),
		configDir: path.join(globalNodeModules, "config"),
		packageRoot: globalNodeModules,
	};
}

/**
 * Resolves file path checking local project first, then package
 */
function resolveFilePath(fileName, subDir = "") {
	const projectRoot = findProjectRoot();
	const paths = resolveGxPaths();

	// Check local project first
	const localPath = path.join(projectRoot, subDir, fileName);
	if (fs.existsSync(localPath)) {
		return { path: localPath, isLocal: true };
	}

	// Fall back to package version
	const packagePath = path.join(paths.configDir, subDir, fileName);
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
	const globalConfigPath = path.join(os.homedir(), "gxto-default-config.json");
	if (fs.existsSync(globalConfigPath)) {
		try {
			return JSON.parse(fs.readFileSync(globalConfigPath, "utf-8"));
		} catch (error) {
			console.warn("Warning: Could not parse global configuration");
		}
	}
	return {};
}

/**
 * Prompts user for input
 */
function promptUser(question) {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

/**
 * Checks if mkcert is available globally
 */
function isMkcertInstalled() {
	return shell.which("mkcert") !== null;
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
	console.log("   gxto assets generate --size 400x300 --name my-placeholder");
	console.log("   gxto assets generate --name icons --count 3 --size 64x64");
	return false;
}

/**
 * Installs mkcert globally if not already installed
 */
function ensureMkcertInstalled() {
	if (isMkcertInstalled()) {
		console.log("✓ mkcert is already installed globally");
		return true;
	}

	console.log("Installing mkcert globally...");
	const result = shell.exec("npm install -g mkcert", { silent: true });

	if (result.code === 0) {
		console.log("✓ mkcert installed successfully");
		return true;
	} else {
		console.warn("⚠ Could not install mkcert globally, will use local version");
		return false;
	}
}

/**
 * Generates SSL certificates for localhost using mkcert
 */
function generateSSLCertificates(projectPath) {
	const certsDir = path.join(projectPath, ".certs");
	const expectedCertPath = path.join(certsDir, "localhost.pem");
	const expectedKeyPath = path.join(certsDir, "localhost-key.pem");

	// Create .certs directory
	if (!fs.existsSync(certsDir)) {
		fs.mkdirSync(certsDir, { recursive: true });
	}

	// Check for existing certificates (including those with suffixes like +2)
	const existingCerts = findExistingCertificates(certsDir);
	if (existingCerts) {
		console.log("✓ SSL certificates already exist");
		return existingCerts;
	}

	console.log("Generating SSL certificates for localhost...");

	// Clean up any leftover certificate files to avoid naming conflicts
	cleanupOldCertificates(certsDir);

	// Try global mkcert first
	let mkcertCmd = "mkcert";
	if (!isMkcertInstalled()) {
		// Use local mkcert via npx
		mkcertCmd = "npx mkcert";
	}

	// Change to certs directory and generate certificates
	const currentDir = process.cwd();
	try {
		process.chdir(certsDir);

		// Install CA if needed (only for global mkcert)
		if (isMkcertInstalled()) {
			shell.exec(`${mkcertCmd} -install`, { silent: true });
		}

		// Generate certificates for localhost
		const result = shell.exec(`${mkcertCmd} localhost 127.0.0.1 ::1`, {
			silent: true,
		});

		if (result.code === 0) {
			// Find the actual generated certificate files
			const generatedCerts = findExistingCertificates(certsDir);
			if (generatedCerts) {
				console.log("✓ SSL certificates generated successfully");
				console.log(
					`📁 Certificate: ${path.basename(generatedCerts.certPath)}`
				);
				console.log(`🔑 Key: ${path.basename(generatedCerts.keyPath)}`);
				return generatedCerts;
			} else {
				console.warn(
					"⚠ Certificates generated but not found in expected location"
				);
				return null;
			}
		} else {
			console.warn(
				"⚠ Failed to generate SSL certificates, falling back to HTTP"
			);
			return null;
		}
	} catch (error) {
		console.warn("⚠ Error generating SSL certificates:", error.message);
		return null;
	} finally {
		process.chdir(currentDir);
	}
}

/**
 * Finds existing SSL certificates in the certs directory, including those with suffixes
 */
function findExistingCertificates(certsDir) {
	if (!fs.existsSync(certsDir)) {
		return null;
	}

	const files = fs.readdirSync(certsDir);

	// Look for localhost certificates (with or without suffixes)
	const certFile = files.find(
		(f) =>
			f.startsWith("localhost") && f.endsWith(".pem") && !f.includes("-key")
	);
	const keyFile = files.find(
		(f) => f.startsWith("localhost") && f.endsWith("-key.pem")
	);

	if (certFile && keyFile) {
		const certPath = path.join(certsDir, certFile);
		const keyPath = path.join(certsDir, keyFile);

		// Verify files actually exist and have content
		try {
			const certStats = fs.statSync(certPath);
			const keyStats = fs.statSync(keyPath);

			if (certStats.size > 0 && keyStats.size > 0) {
				return { certPath, keyPath };
			}
		} catch (error) {
			// Files don't exist or can't be read
		}
	}

	return null;
}

/**
 * Cleans up old SSL certificate files to prevent naming conflicts
 */
function cleanupOldCertificates(certsDir) {
	if (!fs.existsSync(certsDir)) {
		return;
	}

	try {
		const files = fs.readdirSync(certsDir);
		const certFiles = files.filter(
			(f) =>
				f.startsWith("localhost") &&
				(f.endsWith(".pem") || f.endsWith("-key.pem"))
		);

		if (certFiles.length > 0) {
			console.log("🧹 Cleaning up old certificate files...");
			certFiles.forEach((file) => {
				const filePath = path.join(certsDir, file);
				try {
					fs.unlinkSync(filePath);
					console.log(`   Removed: ${file}`);
				} catch (error) {
					console.warn(`   Could not remove ${file}: ${error.message}`);
				}
			});
		}
	} catch (error) {
		console.warn("⚠ Could not clean up old certificates:", error.message);
	}
}

/**
 * Updates the .env file with the actual SSL certificate paths
 */
function updateEnvWithCertPaths(projectPath, certs) {
	const envPath = path.join(projectPath, ".env");

	if (!fs.existsSync(envPath)) {
		console.warn("⚠ .env file not found, skipping certificate path update");
		return;
	}

	try {
		let envContent = fs.readFileSync(envPath, "utf-8");

		// Get just the filenames from the full paths
		const certFileName = path.basename(certs.certPath);
		const keyFileName = path.basename(certs.keyPath);

		// Update CERT_PATH and KEY_PATH with actual filenames
		envContent = envContent.replace(
			/CERT_PATH=.*$/m,
			`CERT_PATH=.certs/${certFileName}`
		);
		envContent = envContent.replace(
			/KEY_PATH=.*$/m,
			`KEY_PATH=.certs/${keyFileName}`
		);

		fs.writeFileSync(envPath, envContent);
		console.log("✓ Updated .env with SSL certificate paths");
		console.log(`   CERT_PATH=.certs/${certFileName}`);
		console.log(`   KEY_PATH=.certs/${keyFileName}`);
	} catch (error) {
		console.warn(
			"⚠ Could not update .env with certificate paths:",
			error.message
		);
	}
}

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
function createPackageJson(projectPath, projectName, useDatastore = false) {
	const packageJsonPath = path.join(projectPath, "package.json");
	const globalConfig = loadGlobalConfig();

	const packageJson = {
		name: projectName,
		version: "1.0.0",
		description: `GxP Plugin: ${projectName}`,
		main: "main.js",
		scripts: {
			dev: "gxto dev --with-socket",
			"dev-app": "gxto dev",
			"dev-http": "gxto dev --no-https",
			build: "gxto build",
			"setup-ssl": "gxto setup-ssl",
			"socket:list": "gxto socket list",
			"socket:send": "gxto socket send",
			"assets:list": "gxto assets list",
			"assets:init": "gxto assets init",
			"assets:generate": "gxto assets generate",
			placeholder:
				"gxto assets generate --size 400x300 --name custom-placeholder",
			...(useDatastore && {
				"datastore:list": "gxto datastore list",
				"datastore:add": "gxto datastore add",
				"datastore:scan": "gxto datastore scan-strings",
				"datastore:config": "gxto datastore config",
			}),
		},
		dependencies: useDatastore
			? REQUIRED_DATASTORE_DEPENDENCIES
			: REQUIRED_DEPENDENCIES,
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
	console.log("Installing dependencies...");
	const currentDir = process.cwd();

	try {
		process.chdir(projectPath);
		shell.exec("npm install");
		console.log("Dependencies installed successfully!");
	} catch (error) {
		console.error("Error installing dependencies:", error);
	} finally {
		process.chdir(currentDir);
	}
}

/**
 * Updates an existing project with missing dependencies
 */
function updateExistingProject(projectPath) {
	const packageJsonPath = path.join(projectPath, "package.json");

	if (fs.existsSync(packageJsonPath)) {
		try {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
			let updated = false;

			// Ensure dependencies exist
			if (!packageJson.dependencies) packageJson.dependencies = {};
			if (!packageJson.devDependencies) packageJson.devDependencies = {};

			// Add missing regular dependencies
			Object.entries(REQUIRED_DEPENDENCIES).forEach(([dep, version]) => {
				if (!packageJson.dependencies[dep]) {
					packageJson.dependencies[dep] = version;
					updated = true;
					console.log(`Adding dependency: ${dep}`);
				}
			});

			// Add gx-componentkit if missing
			if (!packageJson.dependencies["@gramercytech/gx-componentkit"]) {
				packageJson.dependencies["@gramercytech/gx-componentkit"] = "^1.0.0";
				updated = true;
				console.log("Adding dependency: @gramercytech/gx-componentkit");
			}

			// Add missing dev dependencies
			Object.entries(REQUIRED_DEV_DEPENDENCIES).forEach(([dep, version]) => {
				if (!packageJson.devDependencies[dep]) {
					packageJson.devDependencies[dep] = version;
					updated = true;
					console.log(`Adding dev dependency: ${dep}`);
				}
			});

			// Add missing scripts
			if (!packageJson.scripts) packageJson.scripts = {};
			const requiredScripts = {
				dev: "gxto dev --with-socket",
				"dev-app": "gxto dev",
				"dev-http": "gxto dev --no-https",
				build: "gxto build",
				"setup-ssl": "gxto setup-ssl",
				"socket:list": "gxto socket list",
				"socket:send": "gxto socket send",
				"assets:list": "gxto assets list",
				"assets:init": "gxto assets init",
				"assets:generate": "gxto assets generate",
				placeholder:
					"gxto assets generate --size 400x300 --name custom-placeholder",
				"multiple-assets":
					"gxto assets generate --name buttons --count 4 --size 120x40",
			};

			Object.entries(requiredScripts).forEach(([script, command]) => {
				if (!packageJson.scripts[script]) {
					packageJson.scripts[script] = command;
					updated = true;
					console.log(`Adding script: ${script}`);
				}
			});

			if (updated) {
				fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
				console.log("package.json updated!");
				installDependencies(projectPath);
			} else {
				console.log("Project is already up to date!");
			}
		} catch (error) {
			console.error("Error updating package.json:", error);
		}
	}
}

/**
 * Setup SSL certificates command
 */
function setupSSLCommand() {
	const projectPath = findProjectRoot();

	console.log("Setting up SSL certificates for HTTPS development...");

	// Ensure mkcert is available
	ensureMkcertInstalled();

	// Generate certificates
	const certs = generateSSLCertificates(projectPath);

	if (certs) {
		// Update .env file with actual certificate names
		updateEnvWithCertPaths(projectPath, certs);

		console.log("✅ SSL setup complete!");
		console.log("🔒 Your development server will now use HTTPS");
		console.log("📁 Certificates stored in .certs/ directory");
		console.log(
			"🚀 Run 'npm run dev' to start HTTPS development with Socket.IO"
		);
	} else {
		console.log(
			"❌ SSL setup failed. You can still use HTTP with 'npm run dev-http'"
		);
	}
}

/**
 * Initialize command - sets up a new GxP project or updates existing one
 */
async function initCommand(argv) {
	const currentDir = process.cwd();
	const hasPackageJson = fs.existsSync(path.join(currentDir, "package.json"));
	let projectPath = currentDir;
	let projectName;
	let useDatastore = false;
	let sslSetup = false;

	if (!hasPackageJson && !argv.name) {
		// New project - prompt for name
		projectName = await promptUser("Enter project name: ");
		if (!projectName) {
			console.error("Project name is required!");
			process.exit(1);
		}

		// Ask about datastore integration
		const datastoreChoice = await promptUser(
			"Do you want to include GxP Datastore? (y/N): "
		);
		useDatastore =
			datastoreChoice.toLowerCase() === "y" ||
			datastoreChoice.toLowerCase() === "yes";

		// Create project directory
		projectPath = path.join(currentDir, projectName);
		if (fs.existsSync(projectPath)) {
			console.error(`Directory ${projectName} already exists!`);
			process.exit(1);
		}

		console.log(`Creating new project: ${projectName}`);
		if (useDatastore) {
			console.log("✓ Including GxP Datastore with Pinia integration");
		}
		fs.mkdirSync(projectPath, { recursive: true });

		// Create package.json
		createPackageJson(projectPath, projectName, useDatastore);

		// Install dependencies
		installDependencies(projectPath);
	} else if (hasPackageJson) {
		// Existing project - update it
		console.log("Updating existing project...");
		updateExistingProject(projectPath);
	} else if (argv.name) {
		// New project with provided name
		projectName = argv.name;

		// Ask about datastore integration
		const datastoreChoice = await promptUser(
			"Do you want to include GxP Datastore? (y/N): "
		);
		useDatastore =
			datastoreChoice.toLowerCase() === "y" ||
			datastoreChoice.toLowerCase() === "yes";

		projectPath = path.join(currentDir, projectName);

		if (fs.existsSync(projectPath)) {
			console.error(`Directory ${projectName} already exists!`);
			process.exit(1);
		}

		console.log(`Creating new project: ${projectName}`);
		if (useDatastore) {
			console.log("✓ Including GxP Datastore with Pinia integration");
		}
		fs.mkdirSync(projectPath, { recursive: true });
		createPackageJson(projectPath, projectName, useDatastore);
		installDependencies(projectPath);
	}

	// Copy template files
	const paths = resolveGxPaths();
	const filesToCopy = [
		{
			src: useDatastore ? "main-datastore.js" : "main.js",
			dest: "main.js",
			desc: "main.js",
		},
		// Note: server.js stays in package, use 'gxto publish server.js' for local copy
		{
			src: "vite.config.js",
			dest: "vite.config.js",
			desc: "vite.config.js (Build configuration)",
		},
		{
			src: useDatastore ? "App-datastore.vue" : "App.vue",
			dest: "App.vue",
			desc: "App.vue",
		},
		{
			src: "theme-layouts/SystemLayout.vue",
			dest: "src/theme-layouts/SystemLayout.vue",
			desc: "SystemLayout.vue",
		},
		{
			src: "theme-layouts/PrivateLayout.vue",
			dest: "src/theme-layouts/PrivateLayout.vue",
			desc: "PrivateLayout.vue",
		},
		{
			src: "theme-layouts/PublicLayout.vue",
			dest: "src/theme-layouts/PublicLayout.vue",
			desc: "PublicLayout.vue",
		},
		{
			src: "theme-layouts/AdditionalStyling.css",
			dest: "src/theme-layouts/AdditionalStyling.css",
			desc: "AdditionalStyling.css",
		},
		{
			src: "stores/index.js",
			dest: "src/stores/index.js",
			desc: "Pinia store setup",
		},
		{
			src: "AdvancedExample.vue",
			dest: "AdvancedExample.vue",
			desc: "AdvancedExample.vue (Advanced workflow reference)",
		},
		{ src: "index.html", dest: "index.html", desc: "index.html" },
		{
			src: useDatastore ? "Plugin-datastore.vue" : "Plugin.vue",
			dest: "src/Plugin.vue",
			desc: "Plugin.vue",
		},
		{
			src: "app-manifest.json",
			dest: "app-manifest.json",
			desc: "app-manifest.json",
		},
		{ src: "gitignore", dest: ".gitignore", desc: ".gitignore" },
		{ src: "env.example", dest: ".env.example", desc: ".env.example" },
		{
			src: "README.md",
			dest: "README.md",
			desc: "README.md (Project documentation)",
		},
	];

	// Add datastore-specific files if enabled
	if (useDatastore) {
		filesToCopy.push(
			{
				src: "stores/index.js",
				dest: "src/stores/index.js",
				desc: "Pinia store setup",
			},
			// Note: gxp-store.js is now kept in package, use 'gxto publish gxp-store.js' to create local copy
			{
				src: "stores/test-data.json",
				dest: "src/stores/test-data.json",
				desc: "Test data configuration",
			}
		);
	}
	filesToCopy.push(
		{
			src: "socket-events/AiSessionMessageCreated.json",
			dest: "src/socket-events/AiSessionMessageCreated.json",
			desc: "Socket event: AiSessionMessageCreated",
		},
		{
			src: "socket-events/SocialStreamPostCreated.json",
			dest: "src/socket-events/SocialStreamPostCreated.json",
			desc: "Socket event: SocialStreamPostCreated",
		},
		{
			src: "socket-events/SocialStreamPostVariantCompleted.json",
			dest: "src/socket-events/SocialStreamPostVariantCompleted.json",
			desc: "Socket event: SocialStreamPostVariantCompleted",
		}
	);
	filesToCopy.forEach((file) => {
		const srcPath = path.join(paths.configDir, file.src);
		const destPath = path.join(projectPath, file.dest);
		safeCopyFile(srcPath, destPath, file.desc);
	});

	// Create .env file from .env.example
	const envExamplePath = path.join(projectPath, ".env.example");
	const envPath = path.join(projectPath, ".env");
	if (fs.existsSync(envExamplePath) && !fs.existsSync(envPath)) {
		fs.copyFileSync(envExamplePath, envPath);
		console.log("✓ Created .env file from .env.example");
	}

	// Copy extension management scripts for new projects
	if (!hasPackageJson || argv.name) {
		const scriptsDir = path.join(projectPath, "scripts");
		if (!fs.existsSync(scriptsDir)) {
			fs.mkdirSync(scriptsDir, { recursive: true });
		}

		// Copy launch-chrome.js script
		const launchChromeSource = path.join(
			paths.configDir,
			"../scripts/launch-chrome.js"
		);
		const launchChromeDest = path.join(scriptsDir, "launch-chrome.js");
		if (fs.existsSync(launchChromeSource)) {
			safeCopyFile(
				launchChromeSource,
				launchChromeDest,
				"Chrome launcher script"
			);
		}

		// Copy pack-chrome.js script
		const packChromeSource = path.join(
			paths.configDir,
			"../scripts/pack-chrome.js"
		);
		const packChromeDest = path.join(scriptsDir, "pack-chrome.js");
		if (fs.existsSync(packChromeSource)) {
			safeCopyFile(packChromeSource, packChromeDest, "Chrome packaging script");
		}

		// Copy socket events directory for simulation
		const socketEventsSource = path.join(paths.configDir, "socket-events");
		const socketEventsDest = path.join(projectPath, "socket-events");
		if (fs.existsSync(socketEventsSource)) {
			if (!fs.existsSync(socketEventsDest)) {
				fs.mkdirSync(socketEventsDest, { recursive: true });
			}

			const eventFiles = fs
				.readdirSync(socketEventsSource)
				.filter((file) => file.endsWith(".json"));
			eventFiles.forEach((file) => {
				const srcPath = path.join(socketEventsSource, file);
				const destPath = path.join(socketEventsDest, file);
				safeCopyFile(srcPath, destPath, `Socket event: ${file}`);
			});
		}
	}

	// Setup SSL certificates for new projects
	if (!hasPackageJson || argv.name) {
		// Ask user if they want to set up SSL certificates
		const sslChoice = await promptUser(
			"Do you want to set up SSL certificates for HTTPS development? (Y/n): "
		);
		sslSetup =
			sslChoice.toLowerCase() !== "n" && sslChoice.toLowerCase() !== "no";

		if (sslSetup) {
			console.log("\n🔒 Setting up HTTPS development environment...");
			ensureMkcertInstalled();
			const certs = generateSSLCertificates(projectPath);

			// Update .env file with actual certificate names if SSL setup was successful
			if (certs) {
				updateEnvWithCertPaths(projectPath, certs);
			}
		} else {
			console.log(
				"\n⚠️  Skipping SSL setup. You can set it up later with: npm run setup-ssl"
			);
		}
	}

	console.log("✅ Project setup complete!");
	console.log(
		"🎨 GX ComponentKit component library included for rapid kiosk development!"
	);
	if (useDatastore) {
		console.log("🗃️ GxP Datastore included with Pinia integration!");
		console.log("📊 Manage test data with: npm run datastore:add");
		console.log("🔍 Scan components for strings: npm run datastore:scan");
		console.log("📋 List all store variables: npm run datastore:list");
		console.log("📡 Socket simulation available with: npm run socket:list");
		console.log("🎨 Asset management: npm run assets:list");
	}
	if (!hasPackageJson) {
		console.log(`📁 Navigate to your project: cd ${projectName}`);
	}
	console.log("⚙️ Environment file (.env) ready - customize as needed");

	if (sslSetup) {
		console.log("🔒 Start HTTPS development with Socket.IO: npm run dev");
		console.log("🔒 Start HTTPS development only: npm run dev-app");
		console.log("🌐 Start HTTP development: npm run dev-http");
	} else {
		console.log("🌐 Start development: npm run dev-http");
		console.log("🔧 Setup SSL certificates: npm run setup-ssl");
		console.log("🔒 Then use HTTPS development: npm run dev");
	}
	console.log("");
	console.log("📖 Files included:");
	console.log("   • App.vue - Development container (mimics platform)");
	console.log("   • AdvancedExample.vue - Advanced workflow reference");
	console.log("   • Plugin.vue - Your app entry point (customize this!)");
	console.log("📚 Check README.md for detailed usage instructions");
}

/**
 * Development command - starts the dev server
 */
function devCommand(argv) {
	const paths = resolveGxPaths();
	const projectPath = findProjectRoot();

	// Load .env file if it exists for default values
	const envPath = path.join(projectPath, ".env");
	const envExamplePath = path.join(projectPath, ".env.example");

	// Load .env file into process.env
	if (fs.existsSync(envPath)) {
		console.log("📋 Loading environment variables from .env file");
		dotenv.config({ path: envPath });
	} else if (fs.existsSync(envExamplePath)) {
		console.log(
			"💡 Tip: Create .env file from .env.example to customize your environment settings"
		);
		console.log("   cp .env.example .env");
	}

	// Check for SSL certificates unless explicitly disabled
	let useHttps = !argv["no-https"];
	let certPath = "";
	let keyPath = "";

	if (useHttps) {
		const certsDir = path.join(projectPath, ".certs");
		const existingCerts = findExistingCertificates(certsDir);

		if (!existingCerts) {
			console.log(
				"⚠ SSL certificates not found. Run 'npm run setup-ssl' to enable HTTPS"
			);
			console.log("🌐 Starting HTTP development server...");
			useHttps = false;
		} else {
			console.log("🔒 Starting HTTPS development server...");
			console.log(
				`📁 Using certificate: ${path.basename(existingCerts.certPath)}`
			);
			console.log(`🔑 Using key: ${path.basename(existingCerts.keyPath)}`);
			certPath = existingCerts.certPath;
			keyPath = existingCerts.keyPath;
		}
	} else {
		console.log("🌐 Starting HTTP development server...");
	}

	// Determine final port value (priority: CLI arg > .env > default)
	const finalPort = argv.port || process.env.NODE_PORT || 3000;
	console.log(`🌐 Development server will start on port: ${finalPort}`);

	// Check if socket server should be started
	const withSocket = argv["with-socket"];
	let serverJsPath = "";
	if (withSocket) {
		const serverJs = resolveFilePath("server.js");
		if (!fs.existsSync(serverJs.path)) {
			console.error("❌ server.js not found. Cannot start Socket.IO server.");
			console.log(
				"💡 Run 'gxto publish server.js' to create a local copy, or ensure you're in a GxP project directory"
			);
			process.exit(1);
		}
		serverJsPath = serverJs.path;
		console.log(
			`📡 Starting Socket.IO server with nodemon... (${
				serverJs.isLocal ? "local" : "package"
			} version)`
		);
		console.log(`📁 Using: ${serverJsPath}`);
	}

	// Only set environment variables if they're not already set (allows .env to take precedence)
	const envVars = [];

	// Set variables only if not already defined in environment
	if (!process.env.NODE_LOG_LEVEL) {
		envVars.push(
			`${exportCmd} NODE_LOG_LEVEL=${argv.node_log_level || "info"}`
		);
	}
	if (!process.env.NODE_PORT) {
		envVars.push(`${exportCmd} NODE_PORT=${finalPort}`);
	}
	if (!process.env.COMPONENT_PATH) {
		envVars.push(
			`${exportCmd} COMPONENT_PATH=${argv.component_path || "./src/Plugin.vue"}`
		);
	}

	// Always set HTTPS-related variables (these are dynamic)
	envVars.push(`${exportCmd} USE_HTTPS=${useHttps ? "true" : "false"}`);
	envVars.push(`${exportCmd} CERT_PATH=${certPath}`);
	envVars.push(`${exportCmd} KEY_PATH=${keyPath}`);

	// Build the command based on whether socket server is requested
	let command;
	if (withSocket) {
		// Use concurrently to run both servers
		const viteCommand = [
			...envVars,
			`npx vite dev --config "${paths.viteConfigPath}"`,
		].join(" && ");

		command = `npx concurrently --names "VITE,SOCKET" --prefix-colors "cyan,green" "${viteCommand}" "npx nodemon \\"${serverJsPath}\\""`;
	} else {
		// Just run Vite dev server
		command = [
			...envVars,
			`npx vite dev --config "${paths.viteConfigPath}"`,
		].join(" && ");
	}

	shell.exec(command);
}

/**
 * Build command - builds the plugin for production
 */
function buildCommand(argv) {
	const paths = resolveGxPaths();

	console.log("Building plugin...");

	const envVars = [];

	// Set variables only if not already defined in environment
	if (!process.env.NODE_LOG_LEVEL) {
		envVars.push(
			`${exportCmd} NODE_LOG_LEVEL=${argv.node_log_level || "error"}`
		);
	}
	if (!process.env.COMPONENT_PATH) {
		envVars.push(
			`${exportCmd} COMPONENT_PATH=${argv.component_path || "./src/Plugin.vue"}`
		);
	}

	const command = [
		...envVars,
		`npx vite build --config "${paths.viteConfigPath}"`,
	].join(" && ");

	shell.exec(command);
}

/**
 * Publish command - copies package files to local project
 */
async function publishCommand(argv) {
	const projectPath = findProjectRoot();
	const paths = resolveGxPaths();

	const fileName = argv.file || argv._[1]; // Support both --file and positional argument

	if (!fileName) {
		console.log("📦 Available files to publish:");
		console.log("  • server.js          - Socket.IO server file");
		console.log(
			"  • gxpPortalConfigStore.js       - GxP datastore (for datastore projects)"
		);
		console.log("");
		console.log("💡 Usage:");
		console.log("  gxto publish server.js");
		console.log("  gxto publish gxpPortalConfigStore.js");
		console.log("  gxto publish --file server.js");
		return;
	}

	const publishableFiles = {
		"server.js": {
			src: "server.js",
			dest: "server.js",
			desc: "Socket.IO server file",
		},
		"gxpPortalConfigStore.js": {
			src: "stores/gxpPortalConfigStore.js",
			dest: "src/stores/gxpPortalConfigStore.js",
			desc: "GxP datastore",
		},
	};

	const fileConfig = publishableFiles[fileName];
	if (!fileConfig) {
		console.error(`❌ Unknown file: ${fileName}`);
		console.log(
			"📦 Available files:",
			Object.keys(publishableFiles).join(", ")
		);
		process.exit(1);
	}

	const srcPath = path.join(paths.configDir, fileConfig.src);
	const destPath = path.join(projectPath, fileConfig.dest);

	if (!fs.existsSync(srcPath)) {
		console.error(`❌ Source file not found: ${srcPath}`);
		process.exit(1);
	}

	// Check if local file already exists
	if (fs.existsSync(destPath)) {
		const overwrite = await promptUser(
			`📁 ${fileConfig.dest} already exists. Overwrite? (y/N): `
		);
		if (overwrite.toLowerCase() !== "y" && overwrite.toLowerCase() !== "yes") {
			console.log("📦 Publish cancelled");
			return;
		}
	}

	// Ensure destination directory exists
	const destDir = path.dirname(destPath);
	if (!fs.existsSync(destDir)) {
		fs.mkdirSync(destDir, { recursive: true });
	}

	// Copy the file
	safeCopyFile(srcPath, destPath, fileConfig.desc);
	console.log(`✅ Published ${fileName} to project`);
	console.log(`📁 Local file: ${fileConfig.dest}`);

	// Special handling for gxpPortalConfigStore.js - update the import in stores/index.js
	if (fileName === "gxpPortalConfigStore.js") {
		const storeIndexPath = path.join(projectPath, "src/stores/index.js");
		if (fs.existsSync(storeIndexPath)) {
			try {
				let content = fs.readFileSync(storeIndexPath, "utf-8");
				const oldImport =
					"import { useGxpStore } from '@gramercytech/gx-toolkit/config/stores/gxpPortalConfigStore.js';";
				const newImport =
					"import { useGxpStore } from '@/stores/gxpPortalConfigStore.js';";

				if (content.includes(oldImport)) {
					content = content.replace(oldImport, newImport);
					fs.writeFileSync(storeIndexPath, content);
					console.log(
						"📝 Updated stores/index.js to use local gxpPortalConfigStore.js"
					);
				}
			} catch (error) {
				console.warn(
					"⚠️ Could not update stores/index.js import:",
					error.message
				);
			}
		}
	}

	console.log("💡 Future gxto commands will now use your local copy");
	console.log("   Delete the local file to fall back to package version");
}

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
			path.dirname(paths.configDir),
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
				"💡 Run 'gxto init' to create a project with browser extensions"
			);
			process.exit(1);
		}
	} else {
		console.log("🔍 Using project's Firefox extension");
	}

	console.log("🦊 Launching Firefox with extension...");
	console.log("📁 Extension path:", extensionPath);
	shell.exec(`npx web-ext run --source-dir "${extensionPath}"`);
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
			path.dirname(paths.configDir),
			"browser-extensions",
			"chrome"
		);

		if (fs.existsSync(toolkitExtensionPath)) {
			console.log("🔍 Using GxToolkit's built-in Chrome extension");
			extensionPath = toolkitExtensionPath;
			// Use the toolkit's script instead
			scriptPath = path.join(
				path.dirname(paths.configDir),
				"scripts",
				"launch-chrome.js"
			);
		} else {
			console.error("❌ Chrome extension directory not found");
			console.log(
				"📁 Looking for extensions in:",
				path.join(projectPath, "browser-extensions", "chrome")
			);
			console.log(
				"💡 Run 'gxto init' to create a project with browser extensions"
			);
			process.exit(1);
		}
	} else {
		console.log("🔍 Using project's Chrome extension");
	}

	// Verify script exists
	if (!fs.existsSync(scriptPath)) {
		console.error(
			"❌ Chrome launcher script not found. Run 'gxto init' to create it."
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
			path.dirname(paths.configDir),
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
			`npx web-ext build --source-dir "${firefoxPath}" --artifacts-dir "${outputDir}"`
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
			path.dirname(paths.configDir),
			"scripts",
			"pack-chrome.js"
		);
		const toolkitChromePath = path.join(
			path.dirname(paths.configDir),
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

/**
 * Datastore commands for managing test data
 */
function datastoreCommand(argv) {
	const action = argv.action;

	switch (action) {
		case "list":
			listDatastoreVariables();
			break;
		case "add":
			addDatastoreVariable(argv);
			break;
		case "scan-strings":
			scanComponentStrings(argv);
			break;
		case "config":
			switchDatastoreConfig(argv);
			break;
		case "init":
			initDatastoreInExistingProject();
			break;
		default:
			console.log("Available datastore commands:");
			console.log("  list              - List all store variables");
			console.log("  add               - Add a new variable to the store");
			console.log(
				"  scan-strings      - Scan components for hardcoded strings"
			);
			console.log("  config [name]     - Switch between test configurations");
			console.log("  init              - Add datastore to existing project");
	}
}

function listDatastoreVariables() {
	const projectPath = findProjectRoot();
	const testDataPath = path.join(projectPath, "src/stores/test-data.json");

	if (!fs.existsSync(testDataPath)) {
		console.error('❌ No datastore found. Run "gxto datastore init" first.');
		return;
	}

	try {
		const testData = JSON.parse(fs.readFileSync(testDataPath, "utf-8"));

		console.log("📊 GxP Datastore Variables:");
		console.log("");

		if (testData.pluginVars && Object.keys(testData.pluginVars).length > 0) {
			console.log("🔧 Plugin Variables:");
			Object.entries(testData.pluginVars).forEach(([key, value]) => {
				console.log(`  ${key}: ${JSON.stringify(value)}`);
			});
			console.log("");
		}

		if (testData.stringsList && Object.keys(testData.stringsList).length > 0) {
			console.log("📝 Strings:");
			Object.entries(testData.stringsList).forEach(([key, value]) => {
				console.log(`  ${key}: "${value}"`);
			});
			console.log("");
		}

		if (testData.assetList && Object.keys(testData.assetList).length > 0) {
			console.log("🖼️ Assets:");
			Object.entries(testData.assetList).forEach(([key, value]) => {
				console.log(`  ${key}: ${value}`);
			});
			console.log("");
		}

		if (
			testData.dependencyList &&
			Object.keys(testData.dependencyList).length > 0
		) {
			console.log("🔗 Dependencies:");
			Object.entries(testData.dependencyList).forEach(([key, value]) => {
				console.log(`  ${key}: ${value}`);
			});
			console.log("");
		}
	} catch (error) {
		console.error("❌ Error reading test data:", error.message);
	}
}

async function addDatastoreVariable(argv) {
	if (argv.type && argv.key && argv.value) {
		// Use provided arguments
		addVariable(argv.type, argv.key, argv.value);
	} else {
		// Interactive mode
		console.log("Add a new variable to the datastore:");
		console.log("1. string   - Text content for UI");
		console.log("2. setting  - Configuration variable");
		console.log("3. asset    - Asset URL or path");
		console.log("");

		const type = await promptUser(
			"What type of variable? (string/setting/asset): "
		);
		const key = await promptUser("Variable key/name: ");
		const value = await promptUser("Default value: ");

		addVariable(type, key, value);
	}
}

function addVariable(type, key, value) {
	const projectPath = findProjectRoot();
	const testDataPath = path.join(projectPath, "src/stores/test-data.json");

	if (!fs.existsSync(testDataPath)) {
		console.error(
			"❌ No datastore found. Initialize project with datastore first."
		);
		return;
	}

	try {
		const testData = JSON.parse(fs.readFileSync(testDataPath, "utf-8"));

		switch (type.toLowerCase()) {
			case "string":
				testData.stringsList = testData.stringsList || {};
				testData.stringsList[key] = value;
				console.log(`✓ Added string: ${key} = "${value}"`);
				break;
			case "setting":
				testData.pluginVars = testData.pluginVars || {};
				// Try to parse as JSON for numbers/booleans, fallback to string
				try {
					testData.pluginVars[key] = JSON.parse(value);
				} catch {
					testData.pluginVars[key] = value;
				}
				console.log(
					`✓ Added setting: ${key} = ${JSON.stringify(
						testData.pluginVars[key]
					)}`
				);
				break;
			case "asset":
				testData.assetList = testData.assetList || {};
				testData.assetList[key] = value;
				console.log(`✓ Added asset: ${key} = ${value}`);
				break;
			default:
				console.error("❌ Invalid type. Use: string, setting, or asset");
				return;
		}

		fs.writeFileSync(testDataPath, JSON.stringify(testData, null, 2));
		console.log("💾 Datastore updated successfully!");
	} catch (error) {
		console.error("❌ Error updating datastore:", error.message);
	}
}

async function scanComponentStrings(argv) {
	const projectPath = findProjectRoot();
	const componentPath =
		argv.component ||
		(await promptUser("Component file path (e.g., src/Plugin.vue): "));
	const fullPath = path.join(projectPath, componentPath);

	if (!fs.existsSync(fullPath)) {
		console.error(`❌ Component not found: ${componentPath}`);
		return;
	}

	try {
		const content = fs.readFileSync(fullPath, "utf-8");

		// Extract strings from template section
		const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/);
		if (!templateMatch) {
			console.log("❌ No template section found");
			return;
		}

		const template = templateMatch[1];

		// Find text content within HTML elements (simplified regex)
		const stringMatches = template.match(/>\s*([^<>]+[a-zA-Z][^<>]*)\s*</g);

		if (!stringMatches || stringMatches.length === 0) {
			console.log("ℹ️ No hardcoded strings found in template");
			return;
		}

		console.log(
			`🔍 Found ${stringMatches.length} potential strings in ${componentPath}:`
		);
		console.log("");

		const testDataPath = path.join(projectPath, "src/stores/test-data.json");
		let testData = {};

		if (fs.existsSync(testDataPath)) {
			testData = JSON.parse(fs.readFileSync(testDataPath, "utf-8"));
		}

		testData.stringsList = testData.stringsList || {};

		for (const match of stringMatches) {
			const text = match.replace(/>\s*/, "").replace(/\s*</, "").trim();

			if (text.length > 2 && !text.includes("{{") && !text.includes("v-")) {
				const key = text
					.toLowerCase()
					.replace(/[^a-z0-9\s]/g, "")
					.replace(/\s+/g, "_")
					.substring(0, 30);

				if (!testData.stringsList[key]) {
					const add = await promptUser(`Add "${text}" as "${key}"? (y/N): `);
					if (add.toLowerCase() === "y" || add.toLowerCase() === "yes") {
						testData.stringsList[key] = text;
						console.log(`✓ Added: ${key} = "${text}"`);
					}
				}
			}
		}

		fs.writeFileSync(testDataPath, JSON.stringify(testData, null, 2));
		console.log("💾 Scan complete!");
	} catch (error) {
		console.error("❌ Error scanning component:", error.message);
	}
}

async function switchDatastoreConfig(argv) {
	const projectPath = findProjectRoot();
	const storeDir = path.join(projectPath, "src/Store");

	if (!fs.existsSync(storeDir)) {
		console.error(
			"❌ No datastore found. Initialize project with datastore first."
		);
		return;
	}

	if (argv.config) {
		// Switch to specified config
		const configPath = path.join(storeDir, `test-data-${argv.config}.json`);
		const defaultPath = path.join(storeDir, "test-data.json");

		if (fs.existsSync(configPath)) {
			fs.copyFileSync(configPath, defaultPath);
			console.log(`✓ Switched to configuration: ${argv.config}`);
		} else {
			console.error(`❌ Configuration not found: ${argv.config}`);
		}
	} else {
		// List available configurations
		const files = fs
			.readdirSync(storeDir)
			.filter((f) => f.startsWith("test-data-") && f.endsWith(".json"))
			.map((f) => f.replace("test-data-", "").replace(".json", ""));

		if (files.length === 0) {
			console.log("ℹ️ No additional configurations found");
			console.log(
				"💡 Create a new config: cp src/stores/test-data.json src/stores/test-data-production.json"
			);
		} else {
			console.log("Available configurations:");
			files.forEach((config) => console.log(`  ${config}`));
			console.log("");
			console.log("Switch with: gxto datastore config <name>");
		}
	}
}

async function initDatastoreInExistingProject() {
	const projectPath = findProjectRoot();
	const packageJsonPath = path.join(projectPath, "package.json");

	if (!fs.existsSync(packageJsonPath)) {
		console.error(
			"❌ No package.json found. Make sure you are in a GxP project directory."
		);
		return;
	}

	const storeDir = path.join(projectPath, "src/stores");
	if (fs.existsSync(storeDir)) {
		console.error("❌ Datastore already exists in this project.");
		return;
	}

	console.log("🗃️ Adding GxP Datastore to existing project...");

	try {
		// Read current package.json
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

		// Add Pinia and axios dependencies
		if (!packageJson.dependencies) {
			packageJson.dependencies = {};
		}

		packageJson.dependencies.pinia = "^2.1.7";
		packageJson.dependencies.axios = "^1.6.0";

		// Add datastore scripts
		if (!packageJson.scripts) {
			packageJson.scripts = {};
		}

		packageJson.scripts["datastore:list"] = "gxto datastore list";
		packageJson.scripts["datastore:add"] = "gxto datastore add";
		packageJson.scripts["datastore:scan"] = "gxto datastore scan-strings";
		packageJson.scripts["datastore:config"] = "gxto datastore config";

		// Write updated package.json
		fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
		console.log("✓ Updated package.json");

		// Create store directory
		fs.mkdirSync(storeDir, { recursive: true });

		// Copy store files
		const paths = resolveGxPaths();
		const storeFiles = [
			{
				src: "stores/index.js",
				dest: "src/stores/index.js",
				desc: "Pinia store setup",
			},
			{
				src: "stores/gxpPortalConfigStore.js",
				dest: "src/stores/gxpPortalConfigStore.js",
				desc: "GxP datastore",
			},
			{
				src: "stores/test-data.json",
				dest: "src/stores/test-data.json",
				desc: "Test data configuration",
			},
		];

		storeFiles.forEach((file) => {
			const srcPath = path.join(paths.configDir, file.src);
			const destPath = path.join(projectPath, file.dest);
			safeCopyFile(srcPath, destPath, file.desc);
		});

		// Update main.js to include Pinia
		const mainJsPath = path.join(projectPath, "main.js");
		if (fs.existsSync(mainJsPath)) {
			let mainJsContent = fs.readFileSync(mainJsPath, "utf-8");

			// Add Pinia import
			if (!mainJsContent.includes("pinia")) {
				const importLine = 'import { pinia } from "./src/stores/index.js";';
				const importIndex = mainJsContent.indexOf("import * as Vue");
				if (importIndex !== -1) {
					mainJsContent =
						mainJsContent.slice(0, importIndex) +
						importLine +
						"\n" +
						mainJsContent.slice(importIndex);
				} else {
					mainJsContent = importLine + "\n" + mainJsContent;
				}

				// Add Pinia use
				if (!mainJsContent.includes("app.use(pinia)")) {
					const useIndex = mainJsContent.indexOf("app.use(GxComponentKit);");
					if (useIndex !== -1) {
						const endOfLine = mainJsContent.indexOf("\n", useIndex);
						mainJsContent =
							mainJsContent.slice(0, endOfLine) +
							"\napp.use(pinia);" +
							mainJsContent.slice(endOfLine);
					}
				}

				fs.writeFileSync(mainJsPath, mainJsContent);
				console.log("✓ Updated main.js");
			}
		}

		// Install new dependencies
		console.log("📦 Installing dependencies...");
		const result = shell.exec("npm install", {
			cwd: projectPath,
			silent: false,
		});

		if (result.code === 0) {
			console.log("✅ GxP Datastore added successfully!");
			console.log("");
			console.log("📊 Manage test data with: npm run datastore:add");
			console.log("🔍 Scan components for strings: npm run datastore:scan");
			console.log("📋 List all store variables: npm run datastore:list");
			console.log("");
			console.log("💡 Update your components to use the store:");
			console.log('   import { useGxpStore } from "/src/stores/index.js"');
			console.log("   const gxpStore = useGxpStore()");
		} else {
			console.error(
				'❌ Failed to install dependencies. Please run "npm install" manually.'
			);
		}
	} catch (error) {
		console.error("❌ Error adding datastore:", error.message);
	}
}

/**
 * Assets management command - manages development assets and placeholder generation
 */
async function assetsCommand(argv) {
	const action = argv.action;

	if (action === "list") {
		listDevelopmentAssets();
	} else if (action === "generate") {
		await generatePlaceholderImage(argv);
	} else if (action === "init") {
		await initDevelopmentAssets();
	} else {
		console.error(
			"❌ Invalid assets action. Use 'list', 'generate', or 'init'"
		);
		process.exit(1);
	}
}

function listDevelopmentAssets() {
	const projectPath = findProjectRoot();
	const devAssetsDir = path.join(projectPath, "dev-assets");

	if (!fs.existsSync(devAssetsDir)) {
		console.log("❌ No dev-assets directory found");
		console.log("💡 Run 'gxto assets init' to set up development assets");
		return;
	}
	const finalPort = argv.port || process.env.NODE_PORT || 3000;

	console.log("📁 Development Assets:");
	console.log("");

	const dirs = ["images", "videos"];
	dirs.forEach((dir) => {
		const dirPath = path.join(devAssetsDir, dir);
		if (fs.existsSync(dirPath)) {
			const files = fs.readdirSync(dirPath);
			if (files.length > 0) {
				console.log(`📸 ${dir}/`);
				files.forEach((file) => {
					const stats = fs.statSync(path.join(dirPath, file));
					const size = (stats.size / 1024).toFixed(1);
					console.log(`   • ${file} (${size} KB)`);
					console.log(
						`     URL: https://localhost:${finalPort}/dev-assets/${dir}/${file}`
					);
				});
				console.log("");
			}
		}
	});

	console.log("💡 Usage:");
	console.log("   Add assets to your store:");
	console.log(
		`   gxpStore.updateAsset("my_image", "https://localhost:${finalPort}/dev-assets/images/my-image.jpg")`
	);
}

async function generatePlaceholderImage(argv) {
	if (!ensureImageMagickInstalled()) {
		process.exit(1);
	}

	const projectPath = findProjectRoot();
	const size = argv.size || "400x300";
	const name = argv.name || "placeholder";
	const format = argv.format || "png";
	const count = Math.max(1, argv.count || 1);

	const devAssetsDir = path.join(projectPath, "dev-assets", "images");
	if (!fs.existsSync(devAssetsDir)) {
		fs.mkdirSync(devAssetsDir, { recursive: true });
	}

	// Use magick command (ImageMagick 7) or convert (ImageMagick 6)
	const magickCmd = shell.which("magick") ? "magick" : "convert";
	const finalPort = argv.port || process.env.NODE_PORT || 3000;

	const generatedAssets = [];

	console.log(`🎨 Generating ${count} placeholder${count > 1 ? "s" : ""}...`);
	console.log(`📐 Size: ${size}`);

	for (let i = 0; i < count; i++) {
		const color = argv.color || getRandomColor();
		const style = getRandomStyle();
		const suffix = count > 1 ? `-${i + 1}` : "";
		const filename = `${name}${suffix}.${format}`;
		const text =
			argv.text ||
			(count > 1 ? `${name} ${i + 1}\n${size}` : `${name}\n${size}`);
		const outputPath = path.join(devAssetsDir, filename);

		// Create command with style variations
		const styleOptions = getStyleOptions(style, color);
		const command = `${magickCmd} -size ${size} ${styleOptions.background} -gravity center ${styleOptions.text} -annotate +0+0 "${text}" "${outputPath}"`;

		console.log(`🎨 Generating: ${filename} (${color}, ${style.name})`);

		const result = shell.exec(command, { silent: true });

		if (result.code === 0) {
			console.log(`✅ Generated: ${filename}`);
			generatedAssets.push({
				name: count > 1 ? `${name}_${i + 1}` : name,
				filename,
				url: `https://localhost:${finalPort}/dev-assets/images/${filename}`,
				color,
				style: style.name,
			});
		} else {
			console.error(`❌ Failed to generate ${filename}: ${result.stderr}`);
			process.exit(1);
		}
	}

	console.log("");
	console.log("📁 Generated assets:");
	generatedAssets.forEach((asset) => {
		console.log(`   • ${asset.filename} (${asset.color}, ${asset.style})`);
		console.log(`     URL: ${asset.url}`);
	});

	console.log("");
	console.log("💡 Add to your store:");
	generatedAssets.forEach((asset) => {
		console.log(`   gxpStore.updateAsset("${asset.name}", "${asset.url}")`);
	});
}

function getRandomColor() {
	const colors = [
		"#FF6B6B",
		"#4ECDC4",
		"#45B7D1",
		"#96CEB4",
		"#FFEAA7",
		"#DDA0DD",
		"#98D8C8",
		"#F7DC6F",
		"#BB8FCE",
		"#85C1E9",
	];
	return colors[Math.floor(Math.random() * colors.length)];
}

function getRandomStyle() {
	const styles = [
		{
			name: "solid",
			description: "Solid background with white text",
		},
		{
			name: "bright",
			description: "Bright background with contrasting text",
		},
		{
			name: "outline",
			description: "Solid background with outlined text",
		},
		{
			name: "shadow",
			description: "Solid background with shadowed text",
		},
		{
			name: "minimal",
			description: "Clean minimal style with dark text",
		},
	];
	return styles[Math.floor(Math.random() * styles.length)];
}

function getStyleOptions(style, color) {
	const darkerColor = adjustColor(color, -30);
	const lighterColor = adjustColor(color, 30);

	switch (style.name) {
		case "bright":
			return {
				background: `"xc:${lighterColor}"`,
				text: `-pointsize 24 -fill "${darkerColor}"`,
			};
		case "outline":
			return {
				background: `"xc:${color}"`,
				text: `-pointsize 24 -fill none -stroke white -strokewidth 2`,
			};
		case "shadow":
			return {
				background: `"xc:${color}"`,
				text: `-pointsize 24 -fill white -stroke black -strokewidth 1`,
			};
		case "minimal":
			return {
				background: `"xc:${lighterColor}"`,
				text: `-pointsize 20 -fill "${darkerColor}"`,
			};
		default: // solid
			return {
				background: `"xc:${color}"`,
				text: `-pointsize 24 -fill white`,
			};
	}
}

function adjustColor(hex, percent) {
	// Remove # if present
	hex = hex.replace("#", "");

	// Ensure we have a valid 6-character hex
	if (hex.length !== 6) {
		console.error(`Invalid hex color: ${hex}`);
		return "#000000";
	}

	// Parse RGB values
	const r = parseInt(hex.substr(0, 2), 16);
	const g = parseInt(hex.substr(2, 2), 16);
	const b = parseInt(hex.substr(4, 2), 16);

	// Check for NaN values
	if (isNaN(r) || isNaN(g) || isNaN(b)) {
		console.error(`Failed to parse hex color: ${hex}`);
		return "#000000";
	}

	// Adjust brightness
	const adjustValue = (value, percent) => {
		const adjusted = value + (percent * 255) / 100;
		return Math.max(0, Math.min(255, Math.round(adjusted)));
	};

	const newR = adjustValue(r, percent);
	const newG = adjustValue(g, percent);
	const newB = adjustValue(b, percent);

	// Convert back to hex
	const toHex = (value) => value.toString(16).padStart(2, "0");
	return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

async function initDevelopmentAssets() {
	const projectPath = findProjectRoot();
	const devAssetsDir = path.join(projectPath, "dev-assets");

	console.log("🎨 Setting up development assets...");

	// Create directories
	const dirs = ["images", "videos"];
	dirs.forEach((dir) => {
		const dirPath = path.join(devAssetsDir, dir);
		if (!fs.existsSync(dirPath)) {
			fs.mkdirSync(dirPath, { recursive: true });
			console.log(`✓ Created ${dir}/ directory`);
		}
	});

	// Copy starter assets from toolkit
	const paths = resolveGxPaths();
	const sourceAssetsDir = path.join(paths.configDir, "dev-assets");

	if (fs.existsSync(sourceAssetsDir)) {
		console.log("📋 Copying starter assets...");

		// Copy image assets
		const sourceImagesDir = path.join(sourceAssetsDir, "images");
		const destImagesDir = path.join(devAssetsDir, "images");

		if (fs.existsSync(sourceImagesDir)) {
			const imageFiles = fs.readdirSync(sourceImagesDir);
			imageFiles.forEach((file) => {
				const srcPath = path.join(sourceImagesDir, file);
				const destPath = path.join(destImagesDir, file);
				if (!fs.existsSync(destPath)) {
					safeCopyFile(srcPath, destPath, `Asset: ${file}`);
				}
			});
		}
	}

	// Add to .gitignore
	const gitignorePath = path.join(projectPath, ".gitignore");
	if (fs.existsSync(gitignorePath)) {
		let gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
		if (!gitignoreContent.includes("dev-assets/")) {
			gitignoreContent +=
				"\n# Development assets (add your own files here)\ndev-assets/\n";
			fs.writeFileSync(gitignorePath, gitignoreContent);
			console.log("✓ Added dev-assets/ to .gitignore");
		}
	}

	console.log("✅ Development assets setup complete!");
	console.log("");
	console.log("📁 Directory structure:");
	console.log("   dev-assets/");
	console.log("   ├── images/     # Image placeholders");
	console.log("   └── videos/     # Video placeholders");
	console.log("");
	console.log("💡 Commands:");
	console.log(
		"   gxto assets list                           # List all assets"
	);
	console.log(
		"   gxto assets generate --size 800x600       # Generate placeholder"
	);
	console.log(
		"   gxto assets generate --name logo --size 200x200  # Custom placeholder"
	);
	console.log(
		"   gxto assets generate --name banner --count 5    # Generate 5 variants"
	);
}

/**
 * Socket simulation command - sends JSON events to the Socket.IO server
 */
async function socketCommand(argv) {
	const projectPath = findProjectRoot();
	const action = argv.action;

	if (action === "list") {
		listSocketEvents();
	} else if (action === "send") {
		await sendSocketEvent(argv.event, argv.identifier);
	} else {
		console.error("❌ Invalid socket action. Use 'list' or 'send'");
		process.exit(1);
	}
}

function listSocketEvents() {
	const projectPath = findProjectRoot();
	const paths = resolveGxPaths();
	const eventsDir = path.join(paths.configDir, "socket-events");

	if (!fs.existsSync(eventsDir)) {
		console.log("❌ No socket events directory found");
		console.log(`📁 Looking in: ${eventsDir}`);
		return;
	}

	const eventFiles = fs
		.readdirSync(eventsDir)
		.filter((file) => file.endsWith(".json"));

	if (eventFiles.length === 0) {
		console.log("❌ No socket event files found");
		return;
	}

	console.log("📡 Available socket events:");
	console.log("");

	eventFiles.forEach((file) => {
		const eventPath = path.join(eventsDir, file);
		try {
			const eventData = JSON.parse(fs.readFileSync(eventPath, "utf-8"));
			const eventName = path.basename(file, ".json");
			console.log(`🎯 ${eventName}`);
			console.log(`   Event: ${eventData.event}`);
			console.log(`   Channel: ${eventData.channel}`);
			if (eventData.data.id) {
				console.log(`   Data ID: ${eventData.data.id}`);
			}
			console.log("");
		} catch (error) {
			console.error(`❌ Error reading ${file}: ${error.message}`);
		}
	});

	console.log("💡 Usage:");
	console.log("   gxto socket send --event AiSessionMessageCreated");
	console.log(
		"   gxto socket send --event SocialStreamPostCreated --identifier social_stream"
	);
}

async function sendSocketEvent(eventName, identifier) {
	if (!eventName) {
		console.error("❌ Event name is required");
		console.log("💡 Use: gxto socket send --event <EventName>");
		process.exit(1);
	}

	const projectPath = findProjectRoot();
	const paths = resolveGxPaths();
	const eventsDir = path.join(paths.configDir, "socket-events");
	const eventPath = path.join(eventsDir, `${eventName}.json`);
	const socketIoPort = 3061;

	if (!fs.existsSync(eventPath)) {
		console.error(`❌ Event file not found: ${eventName}.json`);
		console.log(`📁 Looking in: ${eventsDir}`);
		console.log("💡 Use 'gxto socket list' to see available events");
		process.exit(1);
	}

	try {
		let eventData = JSON.parse(fs.readFileSync(eventPath, "utf-8"));

		// If identifier is provided, update the channel
		if (identifier) {
			// Try to extract model from the original channel
			const channelParts = eventData.channel.split(".");
			if (channelParts.length >= 2) {
				const model = channelParts[1];
				eventData.channel = `private.${model}.${identifier}`;
			}
		}

		// Send the event via HTTP to the Socket.IO server
		const socketUrl = `https://localhost:${socketIoPort}`;

		console.log(`📡 Sending socket event: ${eventData.event}`);
		console.log(`📺 Channel: ${eventData.channel}`);
		console.log(`📦 Data:`, JSON.stringify(eventData.data, null, 2));

		// Use axios to send the event to our Socket.IO server
		const axios = require("axios");

		try {
			await axios.post(`${socketUrl}/emit`, {
				event: eventData.event,
				channel: eventData.channel,
				data: eventData.data,
			});

			console.log("✅ Socket event sent successfully!");
			console.log(
				"👂 Check your app console for the received event in the store"
			);
		} catch (error) {
			if (error.code === "ECONNREFUSED") {
				console.error("❌ Cannot connect to Socket.IO server");
				console.log("💡 Make sure the server is running:");
				console.log("   npm run dev");
				console.log("   or");
				console.log("   nodemon server.js");
			} else {
				console.error(`❌ Error sending event: ${error.message}`);
			}
		}
	} catch (error) {
		console.error(`❌ Error reading event file: ${error.message}`);
		process.exit(1);
	}
}

// Load global configuration
const globalConfig = loadGlobalConfig();

// Set up yargs CLI
const argv = yargs
	.usage("$0 <command>")
	.config(globalConfig)
	.command(
		"init [name]",
		"Initialize a new GxP project or update existing one",
		{
			name: {
				describe: "Project name (for new projects)",
				type: "string",
			},
		},
		initCommand
	)
	.command(
		"setup-ssl",
		"Setup SSL certificates for HTTPS development",
		{},
		setupSSLCommand
	)
	.command(
		"dev",
		"Start development server",
		{
			port: {
				describe: "Development server port",
				type: "number",
			},
			"node-log-level": {
				describe: "Node log level",
				type: "string",
				default: "info",
			},
			"component-path": {
				describe: "Path to main component",
				type: "string",
				default: "./src/Plugin.vue",
			},
			"no-https": {
				describe: "Disable HTTPS and use HTTP instead",
				type: "boolean",
				default: false,
			},
			"with-socket": {
				describe: "Also start Socket.IO server with nodemon",
				type: "boolean",
				default: false,
				alias: "s",
			},
		},
		devCommand
	)
	.command(
		"build",
		"Build plugin for production",
		{
			"node-log-level": {
				describe: "Node log level",
				type: "string",
				default: "error",
			},
			"component-path": {
				describe: "Path to main component",
				type: "string",
				default: "./src/Plugin.vue",
			},
		},
		buildCommand
	)
	.command(
		"publish [file]",
		"Publish package files to local project",
		{
			file: {
				describe: "File to publish (server.js, gxpPortalConfigStore.js)",
				type: "string",
			},
		},
		publishCommand
	)
	.command(
		"datastore <action>",
		"Manage GxP datastore",
		{
			action: {
				describe: "Action to perform",
				choices: ["list", "add", "scan-strings", "config", "init"],
			},
			type: {
				describe: "Variable type (for add command)",
				choices: ["string", "setting", "asset"],
			},
			key: {
				describe: "Variable key/name (for add command)",
				type: "string",
			},
			value: {
				describe: "Variable value (for add command)",
				type: "string",
			},
			component: {
				describe: "Component path (for scan-strings command)",
				type: "string",
			},
			config: {
				describe: "Configuration name (for config command)",
				type: "string",
			},
		},
		datastoreCommand
	)
	.command(
		"ext:firefox",
		"Launch Firefox with browser extension",
		{},
		extensionFirefoxCommand
	)
	.command(
		"ext:chrome",
		"Launch Chrome with browser extension",
		{},
		extensionChromeCommand
	)
	.command(
		"ext:build",
		"Build browser extensions for distribution",
		{},
		extensionBuildCommand
	)
	.command(
		"socket <action>",
		"Simulate socket events",
		{
			action: {
				describe: "Action to perform",
				choices: ["list", "send"],
			},
			event: {
				describe: "Event name to send (for send action)",
				type: "string",
			},
			identifier: {
				describe: "Override identifier/channel (for send action)",
				type: "string",
			},
		},
		socketCommand
	)
	.command(
		"assets <action>",
		"Manage development assets and placeholders",
		{
			action: {
				describe: "Action to perform",
				choices: ["list", "generate", "init"],
			},
			size: {
				describe: "Image size (for generate action)",
				type: "string",
				default: "400x300",
			},
			name: {
				describe: "Asset name (for generate action)",
				type: "string",
				default: "placeholder",
			},
			color: {
				describe: "Background color (for generate action)",
				type: "string",
			},
			text: {
				describe: "Text to display (for generate action)",
				type: "string",
			},
			format: {
				describe: "Image format (for generate action)",
				type: "string",
				choices: ["png", "jpg", "jpeg", "gif"],
				default: "png",
			},
			count: {
				describe:
					"Number of assets to generate with different colors/styles (for generate action)",
				type: "number",
				default: 1,
			},
		},
		assetsCommand
	)
	.demandCommand(1, "Please provide a valid command")
	.help("h")
	.alias("h", "help")
	.parse();
