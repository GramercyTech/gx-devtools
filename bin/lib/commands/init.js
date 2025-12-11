/**
 * Init Command
 *
 * Sets up a new GxP project or updates an existing one.
 */

const path = require("path");
const fs = require("fs");
const { REQUIRED_DEPENDENCIES } = require("../constants");
const {
	findProjectRoot,
	resolveGxPaths,
	promptUser,
	safeCopyFile,
	createPackageJson,
	installDependencies,
	updateExistingProject,
	ensureMkcertInstalled,
	generateSSLCertificates,
	updateEnvWithCertPaths,
} = require("../utils");

/**
 * Initialize command - sets up a new GxP project or updates existing one
 */
async function initCommand(argv) {
	const currentDir = process.cwd();
	const hasPackageJson = fs.existsSync(path.join(currentDir, "package.json"));
	let projectPath = currentDir;
	let projectName;
	let sslSetup = false;

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
	// Note: PortalContainer.vue (formerly App.vue) is now in runtime/ and accessed via @gx-runtime alias
	// Users don't need a copy - it's immutable and loaded from node_modules
	const paths = resolveGxPaths();
	// Note: main.js, index.html, and vite.config.js are NOT copied by default.
	// They are served from the runtime directory. Users can publish them
	// for customization using: gxdev publish main.js / index.html / vite.config.js
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
	];

	// Copy template files
	filesToCopy.forEach((file) => {
		const srcPath = path.join(paths.templateDir, file.src);
		const destPath = path.join(projectPath, file.dest);
		safeCopyFile(srcPath, destPath, file.desc);
	});

	// Create /src/assets/ directory for user assets
	const assetsDir = path.join(projectPath, "src", "assets");
	if (!fs.existsSync(assetsDir)) {
		fs.mkdirSync(assetsDir, { recursive: true });
		// Add a .gitkeep to ensure the directory is tracked
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

	// Copy extension management scripts for new projects
	if (!hasPackageJson || argv.name) {
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
			safeCopyFile(
				launchChromeSource,
				launchChromeDest,
				"Chrome launcher script"
			);
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

		// Copy socket events directory for simulation (root level for CLI access)
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
	console.log("🗃️ GxP Datastore included with Pinia integration!");
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
	console.log("📖 Project structure:");
	console.log("   • src/Plugin.vue - Your app entry point (customize this!)");
	console.log("   • src/DemoPage.vue - Example component");
	console.log("   • theme-layouts/ - Customizable layout templates");
	console.log(
		"   • main.js - Development entry (loads PortalContainer from toolkit)"
	);
	console.log("📚 Check README.md for detailed usage instructions");

	// For new projects, offer to launch TUI
	if (projectName) {
		console.log("");
		const launchChoice = await promptUser(
			"Would you like to open the project in the interactive TUI? (Y/n): "
		);
		const shouldLaunch =
			launchChoice.toLowerCase() !== "n" && launchChoice.toLowerCase() !== "no";

		if (shouldLaunch) {
			console.log(`\n🚀 Launching gxdev TUI in ${projectName}...`);
			// Change to project directory and launch TUI
			process.chdir(projectPath);

			// Try to launch TUI
			const tuiPath = path.join(
				__dirname,
				"..",
				"..",
				"..",
				"dist",
				"tui",
				"index.js"
			);
			if (fs.existsSync(tuiPath)) {
				try {
					const { startTUI } = await import(tuiPath);
					startTUI({ autoStart: [], args: {} });
				} catch (err) {
					console.error("Could not launch TUI:", err.message);
					console.log(`\nTo start manually:\n  cd ${projectName}\n  gxdev`);
				}
			} else {
				console.log(
					'TUI not available. Run "npm run build:tui" in gx-devtools first.'
				);
				console.log(`\nTo start manually:\n  cd ${projectName}\n  gxdev`);
			}
		} else {
			console.log(`\nTo get started:\n  cd ${projectName}\n  gxdev`);
		}
	}
}

module.exports = {
	initCommand,
};
