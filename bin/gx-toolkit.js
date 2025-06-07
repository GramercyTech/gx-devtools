#!/usr/bin/env node

const yargs = require("yargs");
const shell = require("shelljs");
const path = require("path");
const fs = require("fs");
const os = require("os");
const readline = require("readline");

/**
 * GxToolkit CLI
 *
 * This tool works both as a globally installed npm package and as a local dependency.
 * It provides commands for creating new GxP projects and updating existing ones.
 */

// Platform-specific configurations
const isWin = process.platform === "win32";
const exportCmd = isWin ? "set" : "export";

/**
 * Gets the appropriate gx-componentkit dependency reference
 */
function getGxUikitDependency() {
	// Check if gx-componentkit exists locally (for development)
	const localGxUikit = path.resolve(__dirname, "../../gx-componentkit");
	if (fs.existsSync(localGxUikit)) {
		return `file:${localGxUikit}`;
	}

	// Default to npm package (when published)
	return "^1.0.0";
}

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
	"@gramercytech/gx-componentkit": getGxUikitDependency(),
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
		};
	}

	// Try global installation
	const globalNodeModules = path.join(__dirname, "..");
	return {
		gentoPath: path.join(globalNodeModules, "bin", getBinaryName()),
		viteConfigPath: path.join(globalNodeModules, "vite.config.js"),
		configDir: path.join(globalNodeModules, "config"),
	};
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
	const certPath = path.join(certsDir, "localhost.pem");
	const keyPath = path.join(certsDir, "localhost-key.pem");

	// Check if certificates already exist
	if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
		console.log("✓ SSL certificates already exist");
		return { certPath, keyPath };
	}

	// Create .certs directory
	if (!fs.existsSync(certsDir)) {
		fs.mkdirSync(certsDir, { recursive: true });
	}

	console.log("Generating SSL certificates for localhost...");

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
			console.log("✓ SSL certificates generated successfully");
			return { certPath, keyPath };
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
			dev: "concurrently 'vite' 'nodemon server.js'",
			"dev-http": "HTTPS=false concurrently 'vite' 'nodemon server.js'",
			build: "vite build",
			preview: "vite preview",
			"setup-ssl": "gxto ssl",
			"gxto-dev": "gxto dev",
			"gxto-build": "gxto build",
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
				packageJson.dependencies["@gramercytech/gx-componentkit"] =
					getGxUikitDependency();
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
				dev: "gxto dev",
				"dev-http": "gxto dev --no-https",
				build: "gxto build",
				"dev-socket": "concurrently 'gxto dev' 'nodemon server.js'",
				"setup-ssl": "gxto setup-ssl",
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
		console.log("✅ SSL setup complete!");
		console.log("🔒 Your development server will now use HTTPS");
		console.log("📁 Certificates stored in .certs/ directory");
		console.log("🚀 Run 'npm run dev' to start HTTPS development server");
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
		{ src: "server.js", dest: "server.js", desc: "server.js" },
		{
			src: useDatastore ? "App-datastore.vue" : "App.vue",
			dest: "App.vue",
			desc: "App.vue",
		},
		{
			src: "KioskApp.vue",
			dest: "KioskApp.vue",
			desc: "KioskApp.vue (Advanced kiosk template)",
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
				src: "store/index.js",
				dest: "src/store/index.js",
				desc: "Pinia store setup",
			},
			{
				src: "store/gxp-store.js",
				dest: "src/store/gxp-store.js",
				desc: "GxP datastore",
			},
			{
				src: "store/test-data.json",
				dest: "src/store/test-data.json",
				desc: "Test data configuration",
			}
		);
	}

	filesToCopy.forEach((file) => {
		const srcPath = path.join(paths.configDir, file.src);
		const destPath = path.join(projectPath, file.dest);
		safeCopyFile(srcPath, destPath, file.desc);
	});

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
			generateSSLCertificates(projectPath);
		} else {
			console.log(
				"\n⚠️  Skipping SSL setup. You can set it up later with: npm run setup-ssl"
			);
		}
	}

	console.log("✅ Project setup complete!");
	console.log(
		"🎨 GX UIKit component library included for rapid kiosk development!"
	);
	if (useDatastore) {
		console.log("🗃️ GxP Datastore included with Pinia integration!");
		console.log("📊 Manage test data with: npm run datastore:add");
		console.log("🔍 Scan components for strings: npm run datastore:scan");
		console.log("📋 List all store variables: npm run datastore:list");
	}
	if (!hasPackageJson) {
		console.log(`📁 Navigate to your project: cd ${projectName}`);
	}
	console.log("⚙️ Configure environment: cp .env.example .env");

	if (sslSetup) {
		console.log("🔒 Start HTTPS development: npm run dev");
		console.log("🌐 Start HTTP development: npm run dev-http");
	} else {
		console.log("🌐 Start development: npm run dev-http");
		console.log("🔧 Setup SSL certificates: npm run setup-ssl");
		console.log("🔒 Then use HTTPS development: npm run dev");
	}
	console.log("");
	console.log("📖 Templates available:");
	console.log(
		"   • App.vue - Basic 3-page flow with gx-componentkit integration"
	);
	console.log("   • KioskApp.vue - Advanced kiosk template (full workflow)");
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

	// Suggest copying .env.example if .env doesn't exist
	if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
		console.log(
			"💡 Tip: Copy .env.example to .env to customize your environment settings"
		);
		console.log("   cp .env.example .env");
	}

	// Check for SSL certificates unless explicitly disabled
	let useHttps = !argv["no-https"];
	let certPath = "";
	let keyPath = "";

	if (useHttps) {
		const certsDir = path.join(projectPath, ".certs");
		certPath = path.join(certsDir, "localhost.pem");
		keyPath = path.join(certsDir, "localhost-key.pem");

		if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
			console.log(
				"⚠ SSL certificates not found. Run 'npm run setup-ssl' to enable HTTPS"
			);
			console.log("🌐 Starting HTTP development server...");
			useHttps = false;
		} else {
			console.log("🔒 Starting HTTPS development server...");
		}
	} else {
		console.log("🌐 Starting HTTP development server...");
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
		envVars.push(`${exportCmd} NODE_PORT=${argv.port || 3000}`);
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

	const command = [
		...envVars,
		`vite dev --config "${paths.viteConfigPath}"`,
	].join(" && ");

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
		`vite build --config "${paths.viteConfigPath}"`,
	].join(" && ");

	shell.exec(command);
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
	const testDataPath = path.join(projectPath, "src/store/test-data.json");

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
	const testDataPath = path.join(projectPath, "src/store/test-data.json");

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

		const testDataPath = path.join(projectPath, "src/store/test-data.json");
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
	const storeDir = path.join(projectPath, "src/store");

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
				"💡 Create a new config: cp src/store/test-data.json src/store/test-data-production.json"
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

	const storeDir = path.join(projectPath, "src/store");
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
				src: "store/index.js",
				dest: "src/store/index.js",
				desc: "Pinia store setup",
			},
			{
				src: "store/gxp-store.js",
				dest: "src/store/gxp-store.js",
				desc: "GxP datastore",
			},
			{
				src: "store/test-data.json",
				dest: "src/store/test-data.json",
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
				const importLine = 'import { pinia } from "./src/store/index.js";';
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
					const useIndex = mainJsContent.indexOf("app.use(GxUikit);");
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
			console.log('   import { useGxpStore } from "/src/store/gxp-store.js"');
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
				default: 3000,
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
	.demandCommand(1, "Please provide a valid command")
	.help("h")
	.alias("h", "help")
	.parse();
