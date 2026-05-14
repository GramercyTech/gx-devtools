/**
 * Dev Command
 *
 * Starts the development server with optional Socket.IO support
 * and browser extension launching.
 */

const path = require("path")
const fs = require("fs")
const { spawn } = require("child_process")
const shell = require("shelljs")
const dotenv = require("dotenv")
const {
	findProjectRoot,
	resolveGxPaths,
	resolveFilePath,
	findExistingCertificates,
} = require("../utils")

const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g

/**
 * Create a logger that either emits NDJSON lines or plain text.
 * In JSON mode, every record is a single line: {timestamp, service, level, message}
 */
function createLogger(jsonMode) {
	function emit(level, service, message) {
		if (jsonMode) {
			process.stdout.write(
				JSON.stringify({
					timestamp: new Date().toISOString(),
					service,
					level,
					message,
				}) + "\n",
			)
			return
		}
		const stream =
			level === "error" || level === "warn" ? process.stderr : process.stdout
		stream.write(message + "\n")
	}
	return {
		jsonMode,
		info: (message, service = "GXDEV") => emit("info", service, message),
		warn: (message, service = "GXDEV") => emit("warn", service, message),
		error: (message, service = "GXDEV") => emit("error", service, message),
	}
}

/**
 * Spawn a service and pipe each line of its stdout/stderr through the logger.
 * Returns the child process.
 */
function spawnService(name, command, logger) {
	const child = spawn(command, {
		shell: true,
		stdio: ["ignore", "pipe", "pipe"],
		env: process.env,
	})

	function pipe(stream, level) {
		let buffer = ""
		stream.setEncoding("utf8")
		stream.on("data", (chunk) => {
			buffer += chunk
			let idx
			while ((idx = buffer.indexOf("\n")) !== -1) {
				const line = buffer.slice(0, idx).replace(/\r$/, "")
				buffer = buffer.slice(idx + 1)
				const clean = line.replace(ANSI_REGEX, "")
				if (clean.length > 0) {
					logger[level](clean, name)
				}
			}
		})
		stream.on("end", () => {
			if (buffer.length > 0) {
				const clean = buffer.replace(ANSI_REGEX, "").trim()
				if (clean) {
					logger[level](clean, name)
				}
				buffer = ""
			}
		})
	}

	pipe(child.stdout, "info")
	pipe(child.stderr, "error")
	return child
}

/**
 * Run a list of services concurrently, wiring up line-by-line JSON logging
 * and best-effort shutdown when any one exits or the user hits Ctrl+C.
 */
function runServicesJson(services, logger) {
	const children = services.map((svc) => {
		logger.info(`starting ${svc.name}: ${svc.command}`, svc.name)
		return { svc, child: spawnService(svc.name, svc.command, logger) }
	})

	let shuttingDown = false
	function shutdown(code) {
		if (shuttingDown) {
			return
		}
		shuttingDown = true
		for (const { child } of children) {
			if (!child.killed && child.exitCode === null) {
				child.kill("SIGTERM")
			}
		}
		process.exit(code ?? 0)
	}

	for (const { svc, child } of children) {
		child.on("exit", (code, signal) => {
			logger.info(
				`${svc.name} exited (code=${code ?? "null"}${
					signal ? `, signal=${signal}` : ""
				})`,
				svc.name,
			)
			shutdown(code ?? 0)
		})
		child.on("error", (err) => {
			logger.error(`${svc.name} failed to spawn: ${err.message}`, svc.name)
			shutdown(1)
		})
	}

	process.on("SIGINT", () => shutdown(130))
	process.on("SIGTERM", () => shutdown(143))
}

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
	const logger = createLogger(!!argv.json)
	const paths = resolveGxPaths()
	const projectPath = findProjectRoot()

	// Surface which toolkit install is being used. resolveGxPaths() prefers
	// <project>/node_modules/@gxp-dev/tools (local) and falls back to the
	// CLI's own install location (global / npm link / workspace).
	const localToolkitDir = path.join(
		projectPath,
		"node_modules",
		"@gxp-dev",
		"tools",
	)
	const installLocation =
		paths.packageRoot === localToolkitDir ? "local" : "package"
	const forcedGlobal = process.env.GXDEV_USE_GLOBAL === "true"
	logger.info(
		`📦 Using ${installLocation} toolkit install: ${paths.packageRoot}${
			forcedGlobal ? " (forced via --use-global)" : ""
		}`,
	)

	// Load .env file if it exists for default values
	const envPath = path.join(projectPath, ".env")
	const envExamplePath = path.join(projectPath, ".env.example")

	// Load .env file into process.env
	if (fs.existsSync(envPath)) {
		logger.info("📋 Loading environment variables from .env file")
		dotenv.config({ path: envPath })
	} else if (fs.existsSync(envExamplePath)) {
		logger.info(
			"💡 Tip: Create .env file from .env.example to customize your environment settings",
		)
		logger.info("   cp .env.example .env")
	}

	// Check for SSL certificates unless explicitly disabled
	let useHttps = !argv["no-https"]
	let certPath = ""
	let keyPath = ""

	if (useHttps) {
		const certsDir = path.join(projectPath, ".certs")
		const existingCerts = findExistingCertificates(certsDir)

		if (!existingCerts) {
			logger.warn(
				"⚠ SSL certificates not found. Run 'npm run setup-ssl' to enable HTTPS",
			)
			logger.info("🌐 Starting HTTP development server...")
			useHttps = false
		} else {
			logger.info("🔒 Starting HTTPS development server...")
			logger.info(
				`📁 Using certificate: ${path.basename(existingCerts.certPath)}`,
			)
			logger.info(`🔑 Using key: ${path.basename(existingCerts.keyPath)}`)
			certPath = existingCerts.certPath
			keyPath = existingCerts.keyPath
		}
	} else {
		logger.info("🌐 Starting HTTP development server...")
	}

	// Determine final port value (priority: CLI arg > .env > default)
	const finalPort = argv.port || process.env.NODE_PORT || 3000
	logger.info(`🌐 Development server will start on port: ${finalPort}`)

	// Check if mock API should be enabled
	const withMock = argv["with-mock"]
	if (withMock) {
		logger.info("🎭 Mock API will be enabled")
	}

	// Socket server starts by default unless --no-socket is passed
	const noSocket = argv["no-socket"]
	let serverJsPath = ""
	if (!noSocket) {
		// Check for local server.js first, then runtime directory
		const serverJs = resolveFilePath("server.cjs", "", "runtime")
		if (!fs.existsSync(serverJs.path)) {
			logger.warn("⚠ server.js not found. Skipping Socket.IO server.")
		} else {
			serverJsPath = serverJs.path
			logger.info(
				`📡 Starting Socket.IO server with nodemon... (${
					serverJs.isLocal ? "local" : "package"
				} version)`,
			)
			logger.info(`📁 Using: ${serverJsPath}`)
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
		logger.info("📁 Using local index.html")
	}
	if (hasLocalMainJs) {
		logger.info("📁 Using local main.js")
	}
	if (hasLocalExtend) {
		logger.info("🧩 Extending vite config from vite.extend.js")
	}
	if (!hasLocalIndexHtml && !hasLocalMainJs && !hasLocalExtend) {
		logger.info(
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
			logger.info("🦊 Firefox extension will launch with dev server")
			logger.info(`📁 Extension path: ${firefoxConfig.extensionPath}`)
			logger.info(`🌐 Start URL: ${firefoxConfig.startUrl}`)
		} else {
			logger.warn("⚠️ Firefox extension not found, skipping")
		}
	}

	if (launchChrome) {
		chromeConfig = getBrowserExtensionConfig("chrome", projectPath, paths, {
			useHttps,
			port: finalPort,
		})
		if (chromeConfig) {
			logger.info("🚀 Chrome extension will launch with dev server")
			logger.info(`📁 Extension path: ${chromeConfig.extensionPath}`)
			logger.info(`🌐 Start URL: ${chromeConfig.startUrl}`)
		} else {
			logger.warn("⚠️ Chrome extension not found, skipping")
		}
	}

	// Set CHROME_EXTENSION_PATH on process.env so launch-chrome.js inherits it
	if (chromeConfig) {
		process.env.CHROME_EXTENSION_PATH = chromeConfig.extensionPath
	}

	// Normalize path separators to forward slashes for cross-platform shell compatibility
	const normalizedViteConfigPath = viteConfigPath.replace(/\\/g, "/")

	// Build the canonical service list (raw commands, no concurrently wrapping)
	const services = []
	services.push({
		name: "VITE",
		color: "cyan",
		command: `npx vite dev --config "${normalizedViteConfigPath}"`,
	})

	if (serverJsPath) {
		const normalizedServerPath = serverJsPath.replace(/\\/g, "/")
		services.push({
			name: "SOCKET",
			color: "green",
			command: `npx nodemon "${normalizedServerPath}"`,
		})
	}

	if (firefoxConfig) {
		services.push({
			name: firefoxConfig.name,
			color: firefoxConfig.color,
			command: firefoxConfig.command,
		})
	}

	if (chromeConfig) {
		services.push({
			name: chromeConfig.name,
			color: chromeConfig.color,
			command: chromeConfig.command,
		})
	}

	// In JSON mode we orchestrate the children ourselves so we can wrap every
	// stdout/stderr line as NDJSON. Concurrently's prefixed output would defeat
	// that. Outside JSON mode, keep the legacy concurrently-based behavior.
	if (logger.jsonMode) {
		runServicesJson(services, logger)
		return
	}

	let command
	if (services.length > 1) {
		const quoted = services.map((s) => `"${s.command}"`).join(" ")
		const names = services.map((s) => s.name).join(",")
		const colors = services.map((s) => s.color).join(",")
		command = `npx concurrently --names "${names}" --prefix-colors "${colors}" ${quoted}`
	} else {
		command = services[0].command
	}

	shell.exec(command)
}

module.exports = {
	devCommand,
}
