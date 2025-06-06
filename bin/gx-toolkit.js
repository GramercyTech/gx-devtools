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
 * Creates a package.json for a new project
 */
function createPackageJson(projectPath, projectName) {
	const packageJsonPath = path.join(projectPath, "package.json");

	if (!fs.existsSync(packageJsonPath)) {
		const packageJson = {
			name: projectName,
			version: "1.0.0",
			description: "GxP project created with @gramercytech/gx-toolkit",
			type: "commonjs",
			main: "main.js",
			scripts: {
				dev: "gxto dev",
				"dev-http": "gxto dev --no-https",
				build: "gxto build",
				"dev-socket": "concurrently 'gxto dev' 'nodemon server.js'",
				"setup-ssl": "gxto setup-ssl",
			},
			dependencies: REQUIRED_DEPENDENCIES,
			devDependencies: REQUIRED_DEV_DEPENDENCIES,
			keywords: ["gxp", "eventfinity"],
			author: "",
			license: "ISC",
		};

		console.log("Creating package.json");
		fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
		return true;
	}

	return false;
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

	if (!hasPackageJson && !argv.name) {
		// New project - prompt for name
		projectName = await promptUser("Enter project name: ");
		if (!projectName) {
			console.error("Project name is required!");
			process.exit(1);
		}

		// Create project directory
		projectPath = path.join(currentDir, projectName);
		if (fs.existsSync(projectPath)) {
			console.error(`Directory ${projectName} already exists!`);
			process.exit(1);
		}

		console.log(`Creating new project: ${projectName}`);
		fs.mkdirSync(projectPath, { recursive: true });

		// Create package.json
		createPackageJson(projectPath, projectName);

		// Install dependencies
		installDependencies(projectPath);
	} else if (hasPackageJson) {
		// Existing project - update it
		console.log("Updating existing project...");
		updateExistingProject(projectPath);
	} else if (argv.name) {
		// New project with provided name
		projectName = argv.name;
		projectPath = path.join(currentDir, projectName);

		if (fs.existsSync(projectPath)) {
			console.error(`Directory ${projectName} already exists!`);
			process.exit(1);
		}

		console.log(`Creating new project: ${projectName}`);
		fs.mkdirSync(projectPath, { recursive: true });
		createPackageJson(projectPath, projectName);
		installDependencies(projectPath);
	}

	// Copy template files
	const paths = resolveGxPaths();
	const filesToCopy = [
		{ src: "main.js", dest: "main.js", desc: "main.js" },
		{ src: "server.js", dest: "server.js", desc: "server.js" },
		{ src: "App.vue", dest: "App.vue", desc: "App.vue" },
		{ src: "index.html", dest: "index.html", desc: "index.html" },
		{ src: "Plugin.vue", dest: "src/Plugin.vue", desc: "Plugin.vue" },
		{
			src: "app-manifest.json",
			dest: "app-manifest.json",
			desc: "app-manifest.json",
		},
		{ src: ".gitignore", dest: ".gitignore", desc: ".gitignore" },
		{ src: "env.example", dest: ".env.example", desc: ".env.example" },
	];

	filesToCopy.forEach((file) => {
		const srcPath = path.join(paths.configDir, file.src);
		const destPath = path.join(projectPath, file.dest);
		safeCopyFile(srcPath, destPath, file.desc);
	});

	// Setup SSL certificates for new projects
	if (!hasPackageJson || argv.name) {
		console.log("\nSetting up HTTPS development environment...");
		ensureMkcertInstalled();
		generateSSLCertificates(projectPath);
	}

	console.log("✅ Project setup complete!");
	if (!hasPackageJson) {
		console.log(`📁 Navigate to your project: cd ${projectName}`);
	}
	console.log("⚙️ Configure environment: cp .env.example .env");
	console.log("🔒 Start HTTPS development: npm run dev");
	console.log("🌐 Start HTTP development: npm run dev-http");
	console.log("🔧 Setup SSL certificates: npm run setup-ssl");
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
	.demandCommand(1, "Please provide a valid command")
	.help("h")
	.alias("h", "help")
	.parse();
