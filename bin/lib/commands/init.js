/**
 * Init Command
 *
 * Sets up a new GxP project with interactive configuration.
 *
 * Flow:
 * 1. Create project directory with provided name
 * 2. Copy template files and install dependencies
 * 3. Run interactive configuration:
 *    - App name (prepopulated from package.json)
 *    - Description (prepopulated from package.json)
 *    - AI scaffolding (optional)
 * 4. Prompt to start the app
 * 5. Prompt to launch browser with extension
 */

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { REQUIRED_DEPENDENCIES } = require("../constants");
const {
	findProjectRoot,
	resolveGxPaths,
	promptUser,
	arrowSelectPrompt,
	inputWithDefault,
	multiLinePrompt,
	safeCopyFile,
	createPackageJson,
	updateAppManifest,
	installDependencies,
	updateExistingProject,
	ensureMkcertInstalled,
	generateSSLCertificates,
	updateEnvWithCertPaths,
	runAIScaffolding,
	getAvailableProviders,
} = require("../utils");

/**
 * Copy template files to project
 * @param {string} projectPath - Target project path
 * @param {object} paths - Resolved GxP paths
 */
function copyTemplateFiles(projectPath, paths) {
	const filesToCopy = [
		{
			src: "theme-layouts/SystemLayout.vue",
			dest: "theme-layouts/SystemLayout.vue",
			desc: "SystemLayout.vue",
		},
		{
			src: "theme-layouts/PrivateLayout.vue",
			dest: "theme-layouts/PrivateLayout.vue",
			desc: "PrivateLayout.vue",
		},
		{
			src: "theme-layouts/PublicLayout.vue",
			dest: "theme-layouts/PublicLayout.vue",
			desc: "PublicLayout.vue",
		},
		{
			src: "theme-layouts/AdditionalStyling.css",
			dest: "theme-layouts/AdditionalStyling.css",
			desc: "AdditionalStyling.css",
		},
		{
			src: "src/stores/index.js",
			dest: "src/stores/index.js",
			desc: "Pinia store setup",
		},
		{
			src: "src/Plugin.vue",
			dest: "src/Plugin.vue",
			desc: "Plugin.vue (Your app entry point)",
		},
		{
			src: "src/DemoPage.vue",
			dest: "src/DemoPage.vue",
			desc: "DemoPage.vue (Example component)",
		},
		{
			src: "default-styling.css",
			dest: "default-styling.css",
			desc: "default-styling.css",
		},
		{
			src: "app-instructions.md",
			dest: "app-instructions.md",
			desc: "app-instructions.md",
		},
		{
			src: "configuration.json",
			dest: "configuration.json",
			desc: "configuration.json",
		},
		{
			src: "app-manifest.json",
			dest: "app-manifest.json",
			desc: "app-manifest.json",
		},
		{ src: "env.example", dest: ".env.example", desc: ".env.example" },
		{ src: "gitignore", dest: ".gitignore", desc: ".gitignore" },
		{
			src: "README.md",
			dest: "README.md",
			desc: "README.md (Project documentation)",
		},
		// AI Agent configuration files
		{
			src: "AGENTS.md",
			dest: "AGENTS.md",
			desc: "AGENTS.md (Codex/AI agent instructions)",
		},
		{
			src: "GEMINI.md",
			dest: "GEMINI.md",
			desc: "GEMINI.md (Gemini Code Assist instructions)",
		},
		{
			src: ".claude/agents/gxp-developer.md",
			dest: ".claude/agents/gxp-developer.md",
			desc: "Claude Code subagent (GxP developer)",
		},
		{
			src: ".claude/settings.json",
			dest: ".claude/settings.json",
			desc: "Claude Code MCP settings (GxP API server)",
		},
	];

	// Copy template files
	filesToCopy.forEach((file) => {
		const srcPath = path.join(paths.templateDir, file.src);
		const destPath = path.join(projectPath, file.dest);
		safeCopyFile(srcPath, destPath, file.desc);
	});
}

/**
 * Copy extension scripts to project
 * @param {string} projectPath - Target project path
 * @param {object} paths - Resolved GxP paths
 */
function copyExtensionScripts(projectPath, paths) {
	const scriptsDir = path.join(projectPath, "scripts");
	if (!fs.existsSync(scriptsDir)) {
		fs.mkdirSync(scriptsDir, { recursive: true });
	}

	// Copy launch-chrome.js script
	const launchChromeSource = path.join(
		paths.templateDir,
		"../scripts/launch-chrome.js"
	);
	const launchChromeDest = path.join(scriptsDir, "launch-chrome.js");
	if (fs.existsSync(launchChromeSource)) {
		safeCopyFile(launchChromeSource, launchChromeDest, "Chrome launcher script");
	}

	// Copy pack-chrome.js script
	const packChromeSource = path.join(
		paths.templateDir,
		"../scripts/pack-chrome.js"
	);
	const packChromeDest = path.join(scriptsDir, "pack-chrome.js");
	if (fs.existsSync(packChromeSource)) {
		safeCopyFile(packChromeSource, packChromeDest, "Chrome packaging script");
	}

	// Copy socket events directory
	const socketEventsSource = paths.socketEventsDir;
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

/**
 * Create supporting directories and files
 * @param {string} projectPath - Target project path
 */
function createSupportingFiles(projectPath) {
	// Create /src/assets/ directory
	const assetsDir = path.join(projectPath, "src", "assets");
	if (!fs.existsSync(assetsDir)) {
		fs.mkdirSync(assetsDir, { recursive: true });
		fs.writeFileSync(path.join(assetsDir, ".gitkeep"), "");
		console.log("✓ Created src/assets/ directory for project assets");
	}

	// Create .env file from .env.example
	const envExamplePath = path.join(projectPath, ".env.example");
	const envPath = path.join(projectPath, ".env");
	if (fs.existsSync(envExamplePath) && !fs.existsSync(envPath)) {
		fs.copyFileSync(envExamplePath, envPath);
		console.log("✓ Created .env file from .env.example");
	}
}

/**
 * Read project info from package.json
 * @param {string} projectPath - Project path
 * @returns {object} - { name, description }
 */
function readProjectInfo(projectPath) {
	const packageJsonPath = path.join(projectPath, "package.json");
	if (fs.existsSync(packageJsonPath)) {
		const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
		return {
			name: pkg.name || "",
			description: pkg.description || "",
		};
	}
	return { name: "", description: "" };
}

/**
 * Update package.json with new name and description
 * @param {string} projectPath - Project path
 * @param {string} name - New name
 * @param {string} description - New description
 */
function updatePackageJson(projectPath, name, description) {
	const packageJsonPath = path.join(projectPath, "package.json");
	if (fs.existsSync(packageJsonPath)) {
		const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
		pkg.name = name;
		pkg.description = description;
		fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, "\t"));
	}
}

/**
 * Launch the development server
 * @param {string} projectPath - Project path
 * @param {object} options - { withMock: boolean, noHttps: boolean }
 * @returns {ChildProcess} - The spawned process
 */
function launchDevServer(projectPath, options = {}) {
	const args = ["run"];

	if (options.withMock) {
		args.push("dev");
		// The dev script with mock runs through TUI
	} else {
		args.push(options.noHttps ? "dev-http" : "dev");
	}

	console.log(`\n🚀 Starting development server...`);

	const child = spawn("npm", args, {
		cwd: projectPath,
		stdio: "inherit",
		shell: true,
	});

	return child;
}

/**
 * Launch browser with extension
 * @param {string} projectPath - Project path
 * @param {string} browser - 'chrome' or 'firefox'
 */
function launchBrowserExtension(projectPath, browser) {
	console.log(`\n🌐 Launching ${browser} with GxP extension...`);

	const gxdevPath = path.join(__dirname, "..", "..", "gx-devtools.js");

	spawn("node", [gxdevPath, `ext:${browser}`], {
		cwd: projectPath,
		stdio: "inherit",
		shell: true,
		detached: true,
	}).unref();
}

/**
 * Run interactive configuration after project creation
 * @param {string} projectPath - Path to project directory
 * @param {string} initialName - Initial project name from CLI
 */
async function runInteractiveConfig(projectPath, initialName) {
	console.log("");
	console.log("─".repeat(50));
	console.log("📝 Configure Your Plugin");
	console.log("─".repeat(50));

	// Read current values from package.json
	const projectInfo = readProjectInfo(projectPath);
	const defaultName = projectInfo.name || initialName || path.basename(projectPath);
	const defaultDescription = projectInfo.description || "A GxP kiosk plugin";

	// 1. App Name - with prepopulated value and custom option
	const appName = await arrowSelectPrompt("App name", [
		{ label: defaultName, value: defaultName, description: "From package.json" },
		{ label: "Enter custom name", value: "__custom__", isCustomInput: true, defaultValue: defaultName },
	]);

	// 2. Description - with prepopulated value and custom option
	const description = await arrowSelectPrompt("Description", [
		{ label: defaultDescription, value: defaultDescription, description: "From package.json" },
		{ label: "Enter custom description", value: "__custom__", isCustomInput: true, defaultValue: "" },
	]);

	// Update package.json and app-manifest with new values
	updatePackageJson(projectPath, appName, description);
	updateAppManifest(projectPath, appName, description);

	// 3. AI Scaffolding
	console.log("");
	console.log("─".repeat(50));
	console.log("🤖 AI-Powered Scaffolding");
	console.log("─".repeat(50));
	console.log("   Describe what you want to build and AI will generate");
	console.log("   starter components, views, and manifest configuration.");
	console.log("");

	// Check available AI providers
	const providers = await getAvailableProviders();
	const availableProviders = providers.filter((p) => p.available);

	let aiChoice = "skip";
	let selectedProvider = null;

	if (availableProviders.length === 0) {
		console.log("   ⚠️  No AI providers available.");
		console.log("   To enable AI scaffolding, set up one of:");
		console.log("   • Claude CLI: npm install -g @anthropic-ai/claude-code && claude login");
		console.log("   • Codex CLI: npm install -g @openai/codex && codex auth");
		console.log("   • Gemini CLI: npm install -g @google/gemini-cli && gemini");
		console.log("   • Gemini API: export GEMINI_API_KEY=your_key");
		console.log("");
		aiChoice = "skip";
	} else {
		// Build provider options
		const providerOptions = [
			{ label: "Skip AI scaffolding", value: "skip" },
		];

		for (const provider of availableProviders) {
			let authInfo = "";
			if (provider.id === "gemini") {
				switch (provider.method) {
					case "cli":
						authInfo = "logged in";
						break;
					case "api_key":
						authInfo = "via API key";
						break;
					case "gcloud":
						authInfo = "via gcloud";
						break;
					default:
						authInfo = "";
				}
			} else {
				authInfo = "logged in";
			}
			providerOptions.push({
				label: `${provider.name}`,
				value: provider.id,
				description: `${authInfo}`,
			});
		}

		aiChoice = await arrowSelectPrompt("Choose AI provider for scaffolding", providerOptions);
		if (aiChoice !== "skip") {
			selectedProvider = aiChoice;
		}
	}

	let buildPrompt = "";
	if (selectedProvider) {
		buildPrompt = await multiLinePrompt(
			"📝 Describe your plugin (what it does, key features, UI elements):",
			"Press Enter twice when done"
		);

		if (buildPrompt) {
			await runAIScaffolding(projectPath, appName, description, buildPrompt, selectedProvider);
		}
	}

	// 4. SSL Setup
	console.log("");
	console.log("─".repeat(50));
	console.log("🔒 SSL Configuration");
	console.log("─".repeat(50));

	const sslChoice = await arrowSelectPrompt("Set up SSL certificates for HTTPS development?", [
		{ label: "Yes, set up SSL", value: "yes", description: "Recommended for full feature access" },
		{ label: "Skip SSL setup", value: "no", description: "Can be set up later with npm run setup-ssl" },
	]);

	let sslSetup = false;
	if (sslChoice === "yes") {
		console.log("\n🔒 Setting up HTTPS development environment...");
		ensureMkcertInstalled();
		const certs = generateSSLCertificates(projectPath);
		if (certs) {
			updateEnvWithCertPaths(projectPath, certs);
			sslSetup = true;
		}
	}

	// 5. Start App
	console.log("");
	console.log("─".repeat(50));
	console.log("🚀 Start Development");
	console.log("─".repeat(50));

	const startOptions = [
		{ label: "Start app", value: "start", description: sslSetup ? "HTTPS dev server" : "HTTP dev server" },
		{ label: "Start app with Mock API", value: "start-mock", description: "Dev server + Socket.IO + Mock API" },
		{ label: "Skip", value: "skip" },
	];

	const startChoice = await arrowSelectPrompt("How would you like to start the development server?", startOptions);

	let devProcess = null;
	if (startChoice === "start") {
		// 6. Browser Extension (only if starting)
		console.log("");
		const browserChoice = await arrowSelectPrompt("Launch browser with GxP extension?", [
			{ label: "Chrome", value: "chrome", description: "Launch Chrome with DevTools panel" },
			{ label: "Firefox", value: "firefox", description: "Launch Firefox with DevTools panel" },
			{ label: "Skip", value: "skip" },
		]);

		if (browserChoice !== "skip") {
			// Launch browser first (it will connect when server starts)
			setTimeout(() => {
				launchBrowserExtension(projectPath, browserChoice);
			}, 3000); // Wait a bit for server to start
		}

		devProcess = launchDevServer(projectPath, { noHttps: !sslSetup });
	} else if (startChoice === "start-mock") {
		// 6. Browser Extension (only if starting)
		console.log("");
		const browserChoice = await arrowSelectPrompt("Launch browser with GxP extension?", [
			{ label: "Chrome", value: "chrome", description: "Launch Chrome with DevTools panel" },
			{ label: "Firefox", value: "firefox", description: "Launch Firefox with DevTools panel" },
			{ label: "Skip", value: "skip" },
		]);

		if (browserChoice !== "skip") {
			setTimeout(() => {
				launchBrowserExtension(projectPath, browserChoice);
			}, 3000);
		}

		devProcess = launchDevServer(projectPath, { withMock: true, noHttps: !sslSetup });
	} else {
		// Print final instructions
		printFinalInstructions(projectPath, appName, sslSetup);
	}

	return devProcess;
}

/**
 * Print final setup instructions
 * @param {string} projectPath - Project path
 * @param {string} projectName - Project name
 * @param {boolean} sslSetup - Whether SSL was set up
 */
function printFinalInstructions(projectPath, projectName, sslSetup) {
	console.log("");
	console.log("─".repeat(50));
	console.log("✅ Project setup complete!");
	console.log("─".repeat(50));
	console.log("");
	console.log("🎨 GX ComponentKit component library included!");
	console.log("🗃️ GxP Datastore included with Pinia integration!");
	console.log("");
	console.log(`📁 Project location: ${projectPath}`);
	console.log("");
	console.log("📖 Project structure:");
	console.log("   • src/Plugin.vue - Your app entry point (customize this!)");
	console.log("   • src/DemoPage.vue - Example component");
	console.log("   • theme-layouts/ - Customizable layout templates");
	console.log("   • app-manifest.json - Plugin configuration");
	console.log("");
	console.log("🚀 To start development:");
	console.log(`   cd ${projectName}`);
	if (sslSetup) {
		console.log("   npm run dev          # HTTPS with TUI");
		console.log("   npm run dev-http     # HTTP only");
	} else {
		console.log("   npm run dev-http     # HTTP dev server");
		console.log("   npm run setup-ssl    # Then npm run dev for HTTPS");
	}
	console.log("");
	console.log("📚 Documentation: https://docs.gramercytech.com/gxp-toolkit");
	console.log("");
}

/**
 * Initialize command - sets up a new GxP project or updates existing one
 */
async function initCommand(argv) {
	const currentDir = process.cwd();
	const hasPackageJson = fs.existsSync(path.join(currentDir, "package.json"));
	let projectPath = currentDir;
	let projectName;

	// Handle existing project update
	if (hasPackageJson && !argv.name) {
		console.log("Updating existing project...");
		updateExistingProject(projectPath);
		console.log("✅ Project updated!");
		return;
	}

	// New project - require a name
	if (!argv.name) {
		// In non-interactive mode, name is required
		if (argv.yes) {
			console.error("❌ Project name is required when using --yes flag!");
			console.error("   Usage: gxdev init <project-name> --yes");
			process.exit(1);
		}
		console.log("");
		console.log("🚀 GxP Plugin Creator");
		console.log("─".repeat(40));
		console.log("");
		projectName = await promptUser("📝 Project name: ");
		if (!projectName) {
			console.error("❌ Project name is required!");
			process.exit(1);
		}
	} else {
		projectName = argv.name;
	}

	// Create project directory
	projectPath = path.join(currentDir, projectName);
	if (fs.existsSync(projectPath)) {
		console.error(`\n❌ Directory ${projectName} already exists!`);
		process.exit(1);
	}

	console.log("");
	console.log(`📁 Creating project: ${projectName}`);
	console.log("─".repeat(40));
	fs.mkdirSync(projectPath, { recursive: true });

	// Create package.json
	const initialDescription = argv.description || "A GxP kiosk plugin";
	createPackageJson(projectPath, projectName, initialDescription);

	// Copy template files
	const paths = resolveGxPaths();
	copyTemplateFiles(projectPath, paths);
	copyExtensionScripts(projectPath, paths);
	createSupportingFiles(projectPath);

	// Install dependencies
	console.log("");
	installDependencies(projectPath);

	// Change to project directory
	process.chdir(projectPath);

	// If CLI provided build prompt, skip interactive and just run AI
	if (argv.build) {
		updateAppManifest(projectPath, projectName, initialDescription);
		const provider = argv.provider || "gemini"; // Default to gemini for backward compatibility
		await runAIScaffolding(projectPath, projectName, initialDescription, argv.build, provider);
		printFinalInstructions(projectPath, projectName, false);
		return;
	}

	// If --yes flag provided, skip interactive configuration
	if (argv.yes) {
		updateAppManifest(projectPath, projectName, initialDescription);
		printFinalInstructions(projectPath, projectName, false);
		return;
	}

	// Run interactive configuration
	await runInteractiveConfig(projectPath, projectName);
}

module.exports = {
	initCommand,
};
