/**
 * Datastore Command
 *
 * Manages GxP datastore test data and configuration.
 */

const path = require("path");
const fs = require("fs");
const shell = require("shelljs");
const {
	findProjectRoot,
	resolveGxPaths,
	promptUser,
	safeCopyFile,
} = require("../utils");

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
		console.error('❌ No datastore found. Run "gxdev datastore init" first.');
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
			console.log("Switch with: gxdev datastore config <name>");
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

		packageJson.scripts["datastore:list"] = "gxdev datastore list";
		packageJson.scripts["datastore:add"] = "gxdev datastore add";
		packageJson.scripts["datastore:scan"] = "gxdev datastore scan-strings";
		packageJson.scripts["datastore:config"] = "gxdev datastore config";

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
			const srcPath = path.join(paths.templateDir, file.src);
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

module.exports = {
	datastoreCommand,
};
