/**
 * Dev Command
 *
 * Starts the development server with optional Socket.IO support
 * and browser extension launching.
 */

const path = require("path")
const fs = require("fs")
const shell = require("shelljs")
const dotenv = require("dotenv")
const {
	findProjectRoot,
	resolveGxPaths,
	resolveFilePath,
	findExistingCertificates,
} = require("../utils")

/**
 * Get browser extension paths and commands
 * @param {string} browser - "firefox" or "chrome"
 * @param {string} projectPath - Project root path
 * @param {Object} paths - Resolved GxP paths
 * @param {Object} options - Additional options
 * @param {boolean} options.useHttps - Whether HTTPS is enabled
 * @param {number|string} options.port - Dev server port
 */
function getBrowserExtensionConfig(browser, projectPath, paths, options = {}) {
	const { useHttps = true, port = 3060 } = options
	const protocol = useHttps ? "https" : "http"
	const startUrl = `${protocol}://localhost:${port}`

	if (browser === "firefox") {
		let extensionPath = path.join(projectPath, "browser-extensions", "firefox")

		if (!fs.existsSync(extensionPath)) {
			const toolkitExtensionPath = path.join(
				paths.packageRoot,
				"browser-extensions",
				"firefox",
			)
			if (fs.existsSync(toolkitExtensionPath)) {
				extensionPath = toolkitExtensionPath
			} else {
				return null
			}
		}

		return {
			name: "FIREFOX",
			color: "yellow",
			command: `npx web-ext run --source-dir "${extensionPath}" --start-url "${startUrl}"`,
			extensionPath,
			startUrl,
		}
	}

	if (browser === "chrome") {
		let extensionPath = path.join(projectPath, "browser-extensions", "chrome")
		let scriptPath = path.join(projectPath, "scripts", "launch-chrome.js")

		if (!fs.existsSync(extensionPath)) {
			const toolkitExtensionPath = path.join(
				paths.packageRoot,
				"browser-extensions",
				"chrome",
			)
			if (fs.existsSync(toolkitExtensionPath)) {
				extensionPath = toolkitExtensionPath
				scriptPath = path.join(paths.packageRoot, "scripts", "launch-chrome.js")
			} else {
				return null
			}
		}

		if (!fs.existsSync(scriptPath)) {
			return null
		}

		// Normalize path separators for cross-platform shell compatibility
		const normalizedScriptPath = scriptPath.replace(/\\/g, "/")
		return {
			name: "CHROME",
			color: "blue",
			// Inline KEY=VALUE env syntax doesn't work on Windows; env vars are set on process.env before exec
			command: `node "${normalizedScriptPath}"`,
			extensionPath,
			startUrl,
		}
	}

	return null
}

/**
 * Development command - starts the dev server
 */
function devCommand(argv) {
	const paths = resolveGxPaths()
	const projectPath = findProjectRoot()

	// Load .env file if it exists for default values
	const envPath = path.join(projectPath, ".env")
	const envExamplePath = path.join(projectPath, ".env.example")

	// Load .env file into process.env
	if (fs.existsSync(envPath)) {
		console.log("📋 Loading environment variables from .env file")
		dotenv.config({ path: envPath })
	} else if (fs.existsSync(envExamplePath)) {
		console.log(
			"💡 Tip: Create .env file from .env.example to customize your environment settings",
		)
		console.log("   cp .env.example .env")
	}

	// Check for SSL certificates unless explicitly disabled
	let useHttps = !argv["no-https"]
	let certPath = ""
	let keyPath = ""

	if (useHttps) {
		const certsDir = path.join(projectPath, ".certs")
		const existingCerts = findExistingCertificates(certsDir)

		if (!existingCerts) {
			console.log(
				"⚠ SSL certificates not found. Run 'npm run setup-ssl' to enable HTTPS",
			)
			console.log("🌐 Starting HTTP development server...")
			useHttps = false
		} else {
			console.log("🔒 Starting HTTPS development server...")
			console.log(
				`📁 Using certificate: ${path.basename(existingCerts.certPath)}`,
			)
			console.log(`🔑 Using key: ${path.basename(existingCerts.keyPath)}`)
			certPath = existingCerts.certPath
			keyPath = existingCerts.keyPath
		}
	} else {
		console.log("🌐 Starting HTTP development server...")
	}

	// Determine final port value (priority: CLI arg > .env > default)
	const finalPort = argv.port || process.env.NODE_PORT || 3000
	console.log(`🌐 Development server will start on port: ${finalPort}`)

	// Check if mock API should be enabled
	const withMock = argv["with-mock"]
	if (withMock) {
		console.log("🎭 Mock API will be enabled")
	}

	// Socket server starts by default unless --no-socket is passed
	const noSocket = argv["no-socket"]
	let serverJsPath = ""
	if (!noSocket) {
		// Check for local server.js first, then runtime directory
		const serverJs = resolveFilePath("server.js", "", "runtime")
		if (!fs.existsSync(serverJs.path)) {
			console.warn("⚠ server.js not found. Skipping Socket.IO server.")
		} else {
			serverJsPath = serverJs.path
			console.log(
				`📡 Starting Socket.IO server with nodemon... (${
					serverJs.isLocal ? "local" : "package"
				} version)`,
			)
			console.log(`📁 Using: ${serverJsPath}`)
		}
	}

	// Vite config always comes from the runtime. Projects extend it via an
	// optional `vite.extend.js` at the project root (see runtime/vite.config.js).
	const viteConfigPath = paths.viteConfigPath
	const localIndexHtml = path.join(projectPath, "index.html")
	const localMainJs = path.join(projectPath, "main.js")

	const hasLocalIndexHtml = fs.existsSync(localIndexHtml)
	const hasLocalMainJs = fs.existsSync(localMainJs)
	const hasLocalExtend =
		fs.existsSync(path.join(projectPath, "vite.extend.js")) ||
		fs.existsSync(path.join(projectPath, "vite.extend.mjs"))

	if (hasLocalIndexHtml) {
		console.log("📁 Using local index.html")
	}
	if (hasLocalMainJs) {
		console.log("📁 Using local main.js")
	}
	if (hasLocalExtend) {
		console.log("🧩 Extending vite config from vite.extend.js")
	}
	if (!hasLocalIndexHtml && !hasLocalMainJs && !hasLocalExtend) {
		console.log(
			"📦 Using runtime dev files (create vite.extend.js to customize)",
		)
	}

	// Set environment variables directly on process.env for cross-platform compatibility.
	// Using shell-level "export"/"set" syntax breaks on Windows due to cmd.exe quote parsing.
	if (!process.env.NODE_LOG_LEVEL) {
		process.env.NODE_LOG_LEVEL = argv["node-log-level"] || "info"
	}
	if (!process.env.NODE_PORT) {
		process.env.NODE_PORT = String(finalPort)
	}
	if (!process.env.COMPONENT_PATH) {
		process.env.COMPONENT_PATH = argv["component-path"] || "./src/Plugin.vue"
	}

	// Always set HTTPS-related variables (these are dynamic)
	process.env.USE_HTTPS = useHttps ? "true" : "false"
	process.env.CERT_PATH = certPath
	process.env.KEY_PATH = keyPath

	// Set mock API flag if requested
	if (withMock) {
		process.env.MOCK_API_ENABLED = "true"
	}

	// Check for browser extension flags
	const launchFirefox = argv.firefox
	const launchChrome = argv.chrome

	// Get browser extension configurations
	let firefoxConfig = null
	let chromeConfig = null

	if (launchFirefox) {
		firefoxConfig = getBrowserExtensionConfig("firefox", projectPath, paths, {
			useHttps,
			port: finalPort,
		})
		if (firefoxConfig) {
			console.log("🦊 Firefox extension will launch with dev server")
			console.log(`📁 Extension path: ${firefoxConfig.extensionPath}`)
			console.log(`🌐 Start URL: ${firefoxConfig.startUrl}`)
		} else {
			console.warn("⚠️ Firefox extension not found, skipping")
		}
	}

	if (launchChrome) {
		chromeConfig = getBrowserExtensionConfig("chrome", projectPath, paths, {
			useHttps,
			port: finalPort,
		})
		if (chromeConfig) {
			console.log("🚀 Chrome extension will launch with dev server")
			console.log(`📁 Extension path: ${chromeConfig.extensionPath}`)
			console.log(`🌐 Start URL: ${chromeConfig.startUrl}`)
		} else {
			console.warn("⚠️ Chrome extension not found, skipping")
		}
	}

	// Set CHROME_EXTENSION_PATH on process.env so launch-chrome.js inherits it
	if (chromeConfig) {
		process.env.CHROME_EXTENSION_PATH = chromeConfig.extensionPath
	}

	// Build the command based on what's requested
	let command

	// Collect all processes to run
	const processes = []
	const names = []
	const colors = []

	// Normalize path separators to forward slashes for cross-platform shell compatibility
	const normalizedViteConfigPath = viteConfigPath.replace(/\\/g, "/")

	// Vite is always included
	const viteCommand = `npx vite dev --config "${normalizedViteConfigPath}"`
	processes.push(`"${viteCommand}"`)
	names.push("VITE")
	colors.push("cyan")

	// Socket server (on by default, skip if --no-socket or server.js not found)
	if (serverJsPath) {
		const normalizedServerPath = serverJsPath.replace(/\\/g, "/")
		processes.push(`"npx nodemon \\"${normalizedServerPath}\\""`)
		names.push("SOCKET")
		colors.push("green")
	}

	// Firefox extension (optional)
	if (firefoxConfig) {
		processes.push(`"${firefoxConfig.command}"`)
		names.push(firefoxConfig.name)
		colors.push(firefoxConfig.color)
	}

	// Chrome extension (optional)
	if (chromeConfig) {
		processes.push(`"${chromeConfig.command}"`)
		names.push(chromeConfig.name)
		colors.push(chromeConfig.color)
	}

	// Build the final command
	if (processes.length > 1) {
		// Use concurrently to run multiple processes
		command = `npx concurrently --names "${names.join(
			",",
		)}" --prefix-colors "${colors.join(",")}" ${processes.join(" ")}`
	} else {
		// Just run Vite dev server alone
		command = `npx vite dev --config "${normalizedViteConfigPath}"`
	}

	shell.exec(command)
}

module.exports = {
	devCommand,
}
