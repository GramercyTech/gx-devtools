#!/usr/bin/env node

/**
 * GxToolkit CLI Entry Point
 *
 * This is the main entry point for the gxdev CLI tool.
 * It sets up yargs commands and delegates to the appropriate command modules.
 */

const yargs = require("yargs");
const { loadGlobalConfig } = require("./utils");
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
} = require("./commands");

// Load global configuration
const globalConfig = loadGlobalConfig();

// Set up yargs CLI
yargs
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
			description: {
				describe: "Project description",
				type: "string",
				alias: "d",
			},
			build: {
				describe: "AI build prompt - describe what to build for auto-scaffolding",
				type: "string",
				alias: "b",
			},
			provider: {
				describe: "AI provider for scaffolding (claude, codex, gemini)",
				type: "string",
				alias: "p",
				choices: ["claude", "codex", "gemini"],
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
				describe: "Enable Mock API server (requires --with-socket)",
				type: "boolean",
				default: false,
				alias: "m",
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
		"ext:install <browser>",
		"Install extension permanently in local browser",
		{
			browser: {
				describe: "Browser to install extension in",
				choices: ["chrome", "firefox"],
				type: "string",
			},
		},
		extensionInstallCommand
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
		extractConfigCommand
	)
	.command(
		"add-dependency",
		"Add an API dependency to app-manifest.json via interactive wizard",
		{
			env: {
				describe: "API environment to load specs from",
				type: "string",
				default: "staging",
				choices: ["production", "staging", "testing", "develop", "local"],
				alias: "e",
			},
		},
		addDependencyCommand
	)
	.demandCommand(1, "Please provide a valid command")
	.help("h")
	.alias("h", "help")
	.parse();
