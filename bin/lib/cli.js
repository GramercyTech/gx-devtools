#!/usr/bin/env node

/**
 * GxToolkit CLI Entry Point
 *
 * This is the main entry point for the gxdev CLI tool.
 * It sets up yargs commands and delegates to the appropriate command modules.
 */

const yargs = require("yargs")
const { loadGlobalConfig } = require("./utils")
const {
	initCommand,
	devCommand,
	buildCommand,
	publishCommand,
	setupSSLCommand,
	datastoreCommand,
	socketCommand,
	assetsCommand,
	extensionFirefoxCommand,
	extensionChromeCommand,
	extensionBuildCommand,
	extensionInstallCommand,
	extractConfigCommand,
	addDependencyCommand,
	lintCommand,
} = require("./commands")

// Load global configuration
const globalConfig = loadGlobalConfig()

// Set up yargs CLI
const cli = yargs
	.scriptName("gxdev")
	.usage(
		[
			"Usage: gxdev <command> [options]",
			"",
			"By default every command runs in the plain CLI. Pass --ui to any",
			"command to launch it inside the interactive Terminal UI, or run",
			"`gxdev ui` to open the TUI without starting anything.",
		].join("\n"),
	)
	.config(globalConfig)
	.option("ui", {
		describe:
			"Launch the interactive Terminal UI (auto-starts dev/socket/ext when paired with those commands)",
		type: "boolean",
		default: false,
		global: true,
	})
	.command(
		"ui",
		"Open the interactive Terminal UI without auto-starting anything",
		{},
		() => {
			// The dispatcher in bin/gx-devtools.js intercepts `ui` before yargs
			// ever runs. Reaching this handler means the TUI bundle couldn't be
			// launched (e.g. not built); bubble a helpful hint.
			console.error(
				'TUI is not available. Run "npm run build:tui" inside gx-devtools and try again.',
			)
			process.exit(1)
		},
	)
	.command(
		"init [name]",
		"Initialize a new GxP project or update an existing one in the current directory",
		{
			name: {
				describe: "Project name (for new projects)",
				type: "string",
			},
			description: {
				describe: "Project description",
				type: "string",
				alias: "d",
			},
			build: {
				describe:
					"Non-interactive AI scaffold: describe what to build and apply it directly",
				type: "string",
				alias: "b",
			},
			provider: {
				describe:
					"AI provider for --build scaffolding (interactive mode picks from available CLIs)",
				type: "string",
				alias: "p",
				choices: ["claude", "codex", "gemini"],
			},
			yes: {
				describe: "Skip interactive prompts and use defaults",
				type: "boolean",
				alias: "y",
				default: false,
			},
			local: {
				describe:
					"Initialize in current directory instead of creating a new one",
				type: "boolean",
				alias: "l",
				default: false,
			},
		},
		initCommand,
	)
	.command(
		"setup-ssl",
		"Setup SSL certificates for HTTPS development",
		{},
		setupSSLCommand,
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
			"no-socket": {
				describe: "Disable Socket.IO server",
				type: "boolean",
				default: false,
			},
			firefox: {
				describe: "Launch Firefox with browser extension",
				type: "boolean",
				default: false,
			},
			chrome: {
				describe: "Launch Chrome with browser extension",
				type: "boolean",
				default: false,
			},
			"with-mock": {
				describe: "Enable Mock API server (included with socket server)",
				type: "boolean",
				default: false,
				alias: "m",
			},
		},
		devCommand,
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
		buildCommand,
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
		publishCommand,
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
		datastoreCommand,
	)
	.command(
		"ext:firefox",
		"Launch Firefox with browser extension",
		{},
		extensionFirefoxCommand,
	)
	.command(
		"ext:chrome",
		"Launch Chrome with browser extension",
		{},
		extensionChromeCommand,
	)
	.command(
		"ext:build",
		"Build browser extensions for distribution",
		{},
		extensionBuildCommand,
	)
	.command(
		"ext:install <browser>",
		"Install extension permanently in local browser",
		{
			browser: {
				describe: "Browser to install extension in",
				choices: ["chrome", "firefox"],
				type: "string",
			},
		},
		extensionInstallCommand,
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
		socketCommand,
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
		assetsCommand,
	)
	.command(
		"extract-config",
		"Extract GxP configuration from source files to app-manifest.json",
		{
			"dry-run": {
				describe: "Show what would be extracted without making changes",
				type: "boolean",
				default: false,
				alias: "d",
			},
			overwrite: {
				describe: "Overwrite existing values in manifest",
				type: "boolean",
				default: false,
				alias: "o",
			},
			verbose: {
				describe: "Show detailed output",
				type: "boolean",
				default: false,
				alias: "v",
			},
		},
		extractConfigCommand,
	)
	.command(
		"lint [files..]",
		"Lint GxP config JSON (configuration.json, app-manifest.json) against the templating schema",
		{
			all: {
				describe: "Lint all known config files in the project root",
				type: "boolean",
				default: false,
			},
			json: {
				describe: "Output results as JSON instead of terminal report",
				type: "boolean",
				default: false,
			},
		},
		lintCommand,
	)
	.command(
		"add-dependency",
		"Add an API dependency to app-manifest.json via interactive wizard",
		{
			env: {
				describe: "API environment to load specs from",
				type: "string",
				default: "develop",
				choices: ["develop", "local"],
				alias: "e",
			},
		},
		addDependencyCommand,
	)
	.command("$0", false, {}, () => {
		cli.showHelp()
	})
	.example("gxdev init my-plugin", "Scaffold a new plugin called my-plugin")
	.example(
		"gxdev init",
		"Add the toolkit to the current project (detects existing package.json)",
	)
	.example("gxdev dev", "Start Vite + Socket.IO in plain CLI mode")
	.example("gxdev dev --ui", "Start the dev server inside the interactive TUI")
	.example("gxdev ui", "Open the TUI without auto-starting anything")
	.example("gxdev lint --all", "Lint configuration.json and app-manifest.json")
	.example(
		"gxdev extract-config",
		"Sync app-manifest.json from gxp-string / gxp-src / store usage in src/",
	)
	.epilog(
		[
			"Docs:   https://docs.gxp.dev",
			"AI/MCP: the gxp-api MCP server (bin: gxp-api-server) exposes 29 tools",
			"        across API specs, config editing, docs search, and test helpers.",
		].join("\n"),
	)
	.help("h")
	.alias("h", "help")
	.strict(false)

cli.parse()
