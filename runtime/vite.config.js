import { defineConfig, loadEnv, mergeConfig } from "vite"
import { fileURLToPath, pathToFileURL } from "url"
import { createRequire } from "module"
import vue from "@vitejs/plugin-vue"
import path from "path"
import fs from "fs"
import externalGlobals from "rollup-plugin-external-globals"
import { gxpInspectorPlugin } from "./vite-inspector-plugin.js"
import { gxpSourceTrackerPlugin } from "./vite-source-tracker-plugin.js"

const require = createRequire(import.meta.url)

/**
 * Packages that must NOT be auto-pre-bundled even if a plugin lists them as
 * a dependency. @gxp-dev/tools is the dev-harness runtime itself — it's
 * provided to the plugin (and partly window-shimmed) rather than bundled as
 * an ordinary library, so leave its current handling alone.
 */
const OPTIMIZE_DEPS_EXCLUDE = new Set(["@gxp-dev/tools"])

/**
 * The general problem this and {@link getOptimizeDepsEntries} solve:
 *
 * When Vite discovers a dependency lazily (on the first request that imports
 * it) it re-runs dep optimization and bumps the optimize-deps browser hash.
 * On the preview URL that's invisible — `/@vite/client` catches the
 * resulting 504 ("Outdated Optimize Dep") and full-reloads to recover. But
 * the portal embeds the live preview cross-origin via `import(pluginUrl)`,
 * and that self-healing reload can't happen there: the now-stale
 * `/node_modules/.vite/deps/<dep>.js?v=<hash>` request 504s with no recovery,
 * so the dependency never loads (while same-origin `/src/*` modules, served
 * fresh with no hash, keep working). The cure is to make every dependency a
 * plugin actually uses get pre-bundled ONCE at server start, so its hash is
 * fixed for the whole session. That takes two complementary pieces.
 *
 * --- getOptimizeDepsInclude: force-pre-bundle our linked shared libs ---
 *
 * Vite does NOT pre-bundle linked / workspace packages by default, even when
 * they're discovered — and our @gxp-dev/* component libraries are exactly
 * that (workspace packages shipping pre-compiled ESM with `preserveModules`).
 * They must be named in `optimizeDeps.include` or they get the lazy, hash-
 * churning treatment. We pull them straight from the plugin's own
 * `package.json` dependencies, so any @gxp-dev/* library a plugin adds is
 * handled automatically — no per-package edit to this config is ever needed.
 *
 * Scope notes:
 *   - Only `@gxp-dev/*` deps are force-included. Ordinary npm libraries don't
 *     need it — once discovered by the startup scan (see entries) Vite
 *     pre-bundles them normally. This also keeps node-only / build-time deps
 *     a plugin might list (e.g. dotenv) out of the browser optimizer, since
 *     they're never imported from src and so never scanned.
 *   - @gxp-dev/tools is excluded: it's the dev-harness runtime, provided to
 *     the plugin (and partly window-shimmed), not bundled as a normal lib.
 *   - vue + pinia are always included (deduped to a single instance).
 *   - Each name is probed for resolvability so an uninstalled entry can't
 *     make the optimizer throw at startup.
 *
 * @returns {string[]}
 */
function getOptimizeDepsInclude() {
	const include = ["vue", "pinia"]
	const resolvePaths = [
		process.cwd(),
		path.dirname(fileURLToPath(import.meta.url)),
	]

	try {
		const pkgPath = path.resolve(process.cwd(), "package.json")
		if (fs.existsSync(pkgPath)) {
			const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
			for (const dep of Object.keys(pkg.dependencies || {})) {
				if (!dep.startsWith("@gxp-dev/")) {
					continue
				}
				if (include.includes(dep) || OPTIMIZE_DEPS_EXCLUDE.has(dep)) {
					continue
				}
				try {
					require.resolve(dep, { paths: resolvePaths })
					include.push(dep)
				} catch {
					// Declared but not resolvable from here (not installed, or
					// exposes only subpaths) — skip rather than crash the optimizer.
				}
			}
		}
	} catch {
		// Unreadable/invalid package.json — fall back to vue + pinia only.
	}

	return include
}

/**
 * Entry files Vite scans at startup to discover dependencies up front.
 *
 * The plugin has no root `index.html` (the harness serves runtime/index.html
 * via middleware with `root` set to the plugin dir), so Vite's default entry
 * scan finds nothing and falls back to discovering deps lazily at request
 * time — the exact hash-churn that breaks the cross-origin portal embed (see
 * {@link getOptimizeDepsInclude}). Pointing the scan at the plugin's own
 * source makes every ordinary library it imports get pre-bundled at boot with
 * a stable hash. Combined with the @gxp-dev/* force-include above, this means
 * a plugin author just adds a dependency and imports it — no edit here.
 *
 * @param {Record<string, string>} env
 * @returns {string[]}
 */
function getOptimizeDepsEntries(env = {}) {
	const entries = [
		path.resolve(process.cwd(), "src/**/*.{vue,js,ts,jsx,tsx,mjs}"),
	]
	if (env.COMPONENT_PATH) {
		entries.unshift(path.resolve(process.cwd(), env.COMPONENT_PATH))
	}
	return entries
}

// Environment URL configuration for API proxy
const ENVIRONMENT_URLS = {
	production: "https://api.gramercy.cloud",
	staging: "https://api.efz-staging.env.eventfinity.app",
	testing: "https://api.zenith-develop-testing.env.eventfinity.app",
	develop: "https://api.zenith-develop.env.eventfinity.app",
	local: "https://dashboard.eventfinity.test",
}

/**
 * Get the API proxy target URL based on environment
 */
function getApiProxyTarget(env) {
	const apiEnv = env.API_ENV || "mock"

	// Custom URL takes precedence
	if (env.API_BASE_URL) {
		return env.API_BASE_URL
	}

	// Mock uses local mock-api server (no proxy needed, handled separately)
	if (apiEnv === "mock" || apiEnv === "dev-mock") {
		return null
	}

	// Look up environment URL
	return ENVIRONMENT_URLS[apiEnv] || ENVIRONMENT_URLS.production
}

/**
 * Get the library name from package.json
 */
function getLibName() {
	try {
		const packageJsonPath = path.resolve(process.cwd(), "package.json")
		if (fs.existsSync(packageJsonPath)) {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"))
			// Convert package name to a valid JS identifier
			// e.g., "@company/my-plugin" -> "MyPlugin"
			const name = packageJson.name || "Plugin"
			return name
				.replace(/[@\/\-]/g, " ")
				.replace(/\b\w/g, (l) => l.toUpperCase())
				.replace(/\s/g, "")
		}
	} catch (error) {
		console.warn("Could not read package.json, using default lib name")
	}
	return "Plugin"
}

/**
 * Setup HTTPS configuration if certificates are available
 */
function getHttpsConfig(env) {
	const useHttps = env.USE_HTTPS === "true"
	const certPath = env.CERT_PATH
	const keyPath = env.KEY_PATH

	if (!useHttps || !certPath || !keyPath) {
		return undefined
	}

	// Resolve paths relative to project root
	const resolvedCertPath = path.resolve(process.cwd(), certPath)
	const resolvedKeyPath = path.resolve(process.cwd(), keyPath)

	// Check if certificate files exist
	if (!fs.existsSync(resolvedCertPath) || !fs.existsSync(resolvedKeyPath)) {
		console.warn("⚠ SSL certificate files not found, falling back to HTTP")
		return undefined
	}

	try {
		return {
			key: fs.readFileSync(resolvedKeyPath),
			cert: fs.readFileSync(resolvedCertPath),
		}
	} catch (error) {
		console.warn("⚠ Failed to read SSL certificates, falling back to HTTP")
		return undefined
	}
}

/**
 * Find the gx-devtools package directory (works for both local and global installs)
 */
function findToolkitPath() {
	// Derive from this config file's own location — always reliable regardless
	// of how the package is installed (local, global, npm link, CI, etc.)
	// This file lives at <toolkit>/runtime/vite.config.js, so toolkit root is one level up.
	const configFileDir = path.dirname(fileURLToPath(import.meta.url))
	return path.resolve(configFileDir, "..")
}

/**
 * Check if a file exists locally in the project
 */
function hasLocalFile(fileName) {
	const localPath = path.resolve(process.cwd(), fileName)
	return fs.existsSync(localPath)
}

/**
 * Load the project-local `vite.extend.js` (or `.mjs`) if one exists.
 *
 * The file may export either a config object or a function
 * `(ctx) => config | Promise<config>`, where `ctx` is
 * `{ mode, command, env, runtimeConfig }`. The returned config is deep-merged
 * into the runtime config via Vite's `mergeConfig` — arrays (plugins) are
 * concatenated, objects (resolve.alias, define, etc.) are merged key-by-key,
 * primitives are overwritten.
 */
/**
 * Try to load the `@tailwindcss/vite` plugin from the project's node_modules.
 *
 * Tailwind 4 is a DEV-ONLY base CSS framework here — declared in the project's
 * devDependencies and imported via `@import "tailwindcss";` inside the
 * theme-layouts. We deliberately do not run it during `vite build`:
 *
 *   1. The layouts aren't part of the production build (entry is
 *      `src/Plugin.vue`), so there's no `@import "tailwindcss"` reaching the
 *      build graph and the generated utilities would have nowhere to live.
 *   2. The plugin scans the whole project (including `node_modules`) for
 *      candidate class names. @gxp-dev/app-ui ships compiled Vue files
 *      whose arbitrary-value Tailwind utilities reference the platform's
 *      underscored CSS variables (page-background, keyboard-key-active,
 *      etc.). Tailwind 4 treats underscores inside arbitrary values as
 *      spaces, producing CSS with spaces in the var() name — invalid CSS
 *      that breaks lightningcss minification at build time. (No literal
 *      example here on purpose: the scanner would treat it as a class.)
 *
 * In dev (`command === "serve"`) we load it; in build we skip and let the
 * platform supply Tailwind at runtime (per `app-manifest.json.baseFramework`).
 * Silently no-ops if the user has uninstalled Tailwind.
 */
async function loadTailwindPlugin(command) {
	if (command !== "serve") {
		return null
	}
	try {
		// Resolve from the project root, not the toolkit's location.
		// A bare import("@tailwindcss/vite") resolves relative to this config
		// file's directory (inside the toolkit), so it fails for global and
		// npm-linked installs where the toolkit's node_modules is separate from
		// the project's. createRequire roots the lookup at process.cwd() instead.
		const { createRequire } = await import("module")
		const projectRequire = createRequire(
			path.resolve(process.cwd(), "package.json"),
		)
		const resolved = projectRequire.resolve("@tailwindcss/vite")
		const mod = await import(pathToFileURL(resolved).href)
		const plugin = mod.default ?? mod
		return typeof plugin === "function" ? plugin() : null
	} catch {
		console.warn(
			"⚠ @tailwindcss/vite plugin not found in project dependencies, skipping Tailwind integration (dev only)",
		)
		return null
	}
}

async function loadExtensionConfig(ctx, runtimeConfig) {
	const candidates = ["vite.extend.js", "vite.extend.mjs"]
	for (const name of candidates) {
		const abs = path.resolve(process.cwd(), name)
		if (!fs.existsSync(abs)) {
			continue
		}
		try {
			const mod = await import(pathToFileURL(abs).href)
			const exported = mod.default ?? mod
			const extension =
				typeof exported === "function"
					? await exported({ ...ctx, runtimeConfig })
					: exported
			if (extension && typeof extension === "object") {
				console.log(`🧩 Loaded ${name}`)
				return extension
			}
		} catch (err) {
			console.warn(`⚠ Failed to load ${name}:`, err.message)
		}
		return null
	}
	return null
}

export default defineConfig(async (ctx) => {
	const { mode } = ctx
	// Load environment variables from project directory
	const env = loadEnv(mode, process.cwd(), "")

	// Get lib name from package.json
	const libName = getLibName()

	// Find the toolkit path for runtime imports
	const toolkitPath = findToolkitPath()
	const runtimeDir = path.resolve(toolkitPath, "runtime")

	// Check for local dev files (requires both env var AND file to exist)
	const hasLocalIndexHtml = hasLocalFile("index.html")
	const hasLocalMainJs = hasLocalFile("main.js")
	const useLocalIndex = env.USE_LOCAL_INDEX === "true" && hasLocalIndexHtml
	const useLocalMain = env.USE_LOCAL_MAIN === "true" && hasLocalMainJs

	// Plugin enable/disable flags
	const useSourceTracker = env.DISABLE_SOURCE_TRACKER !== "true"
	const useInspector = env.DISABLE_INSPECTOR !== "true"

	// Log which files are being used
	console.log(`📄 index.html: ${useLocalIndex ? "local" : "runtime"}`)
	console.log(`📄 main.js: ${useLocalMain ? "local" : "runtime"}`)

	// Build /@fs/ URLs that work regardless of whether the toolkit is inside
	// the project's node_modules or installed globally. Vite's /@fs/ handler
	// serves these via server.fs.allow (which already includes toolkitPath),
	// so absolute paths outside process.cwd() just work.
	const realRuntimeDir = (() => {
		try {
			return fs.realpathSync(runtimeDir)
		} catch {
			return runtimeDir
		}
	})().replace(/\\/g, "/")
	const toFsUrl = (relPath) =>
		`/@fs${realRuntimeDir.startsWith("/") ? "" : "/"}${realRuntimeDir}/${relPath}`
	const runtimeMainFsUrl = toFsUrl("main.js")
	const runtimeLogoFsUrl = toFsUrl("logo.png")

	// ---------------------------------------------------------------------
	// Live log streaming for the developer hub IDE.
	//
	// The portal's Session page wants to surface gxdev's stdout/stderr (Vite
	// build errors, HMR notices, custom console.log from the project, etc.)
	// in a bottom dock so the developer doesn't have to `kubectl logs` from
	// outside the cluster. We keep a small ring buffer of recent lines and
	// fan them out to any number of SSE subscribers — the buffer is replayed
	// to each new subscriber so they see context from before they connected.
	//
	// We hook process.stdout.write / process.stderr.write rather than
	// Vite's customLogger so we also capture lines emitted by the user's
	// plugins, the runtime mock-api, console.log from server-side code,
	// etc. The patch is a wrapper, not a replacement — the original
	// terminal output keeps working unchanged.
	const LOG_BUFFER_MAX = 500
	const logBuffer = []
	const logSubscribers = new Set()

	function pushLog(stream, chunk) {
		const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8")
		if (!text) return
		// Split on newlines so each line is its own SSE event. Trailing
		// empty splits (from `foo\n`) become "" — skip them.
		const lines = text.split(/\r?\n/)
		const ts = Date.now()
		for (const raw of lines) {
			if (!raw) continue
			const entry = { stream, line: raw, ts }
			logBuffer.push(entry)
			if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift()
			for (const send of logSubscribers) {
				try {
					send(entry)
				} catch {
					// subscriber errored — drop it on the floor; the
					// `res.on("close")` cleanup handles dead clients.
				}
			}
		}
	}

	const _originalStdoutWrite = process.stdout.write.bind(process.stdout)
	const _originalStderrWrite = process.stderr.write.bind(process.stderr)
	process.stdout.write = function (chunk, ...rest) {
		pushLog("stdout", chunk)
		return _originalStdoutWrite(chunk, ...rest)
	}
	process.stderr.write = function (chunk, ...rest) {
		pushLog("stderr", chunk)
		return _originalStderrWrite(chunk, ...rest)
	}

	// Create plugin to serve runtime files (index.html and main.js) if no local ones exist
	const runtimeFilesPlugin = {
		name: "runtime-files",
		// Resolve the legacy `/@gx-runtime/*` absolute-URL form used by
		// runtime/index.html (and by any project index.html that hasn't
		// migrated to the bare `@gx-runtime/...` specifier). Vite's
		// resolve.alias map only catches bare specifiers, and the
		// configureServer middleware below only catches HTTP requests —
		// Vite's internal pre-transform of script-src URLs takes
		// neither path and ends up logging
		//   "Pre-transform error: Failed to load url /@gx-runtime/main.js"
		// every render tick. Returning the real filesystem path here
		// short-circuits the resolution entirely so pre-transform, the
		// dep optimizer, and SSR all agree on where the file lives.
		resolveId(id) {
			if (typeof id !== "string") return null
			if (id.startsWith("/@gx-runtime/")) {
				const relative = id.slice("/@gx-runtime/".length)
				if (!relative) return null
				// Strip any query string (e.g. ?t=12345 from HMR) before
				// resolving against the filesystem.
				const [bare, query] = relative.split("?")
				const resolved = path.resolve(runtimeDir, bare)
				return query ? `${resolved}?${query}` : resolved
			}
			return null
		},
		configureServer(server) {
			// SSE endpoint that streams gxdev's stdout/stderr to the
			// portal's IDE. CORS is wide open because the portal is on a
			// different origin than the preview pod (dashboard.<env> vs
			// <subdomain>.dev.<env>) and we already gate access at the
			// network layer — the preview URLs are unguessable and live
			// inside the cluster's preview namespace.
			server.middlewares.use("/__logs", (req, res) => {
				if (req.method === "OPTIONS") {
					res.writeHead(204, {
						"Access-Control-Allow-Origin": "*",
						"Access-Control-Allow-Methods": "GET, OPTIONS",
						"Access-Control-Allow-Headers": "*",
					})
					res.end()
					return
				}
				if (req.method !== "GET") {
					res.writeHead(405)
					res.end()
					return
				}
				res.writeHead(200, {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache, no-transform",
					Connection: "keep-alive",
					"Access-Control-Allow-Origin": "*",
					"X-Accel-Buffering": "no",
				})
				// Replay buffered lines so the client gets context.
				for (const entry of logBuffer) {
					res.write(`data: ${JSON.stringify(entry)}\n\n`)
				}
				// Heartbeat every 25s to keep the connection alive
				// through any intermediate idle-timeout (GCP LB defaults
				// to 30s; we already bump it to 86400s via
				// GCPBackendPolicy but the heartbeat is cheap insurance).
				const heartbeat = setInterval(() => {
					res.write(`: heartbeat\n\n`)
				}, 25000)
				const send = (entry) => {
					res.write(`data: ${JSON.stringify(entry)}\n\n`)
				}
				logSubscribers.add(send)
				req.on("close", () => {
					clearInterval(heartbeat)
					logSubscribers.delete(send)
				})
			})

			server.middlewares.use((req, res, next) => {
				// Serve runtime index.html for root requests and SPA navigation requests
				// (unless local index.html is opted in). SPA fallback is required so
				// client-side routers (e.g. vue-router createWebHistory) can handle
				// deep links when no physical index.html exists at the project root.
				const rawUrl = req.url || ""
				const urlPath = rawUrl.split("?")[0]
				const accept = req.headers.accept || ""
				const isGetOrHead = req.method === "GET" || req.method === "HEAD"
				const isInternalPath =
					urlPath.startsWith("/@") ||
					urlPath.startsWith("/__") ||
					urlPath.startsWith("/node_modules/") ||
					urlPath.startsWith("/src/") ||
					urlPath.startsWith("/dev-assets/") ||
					urlPath.startsWith("/api-proxy/")
				const hasExtension = path.extname(urlPath) !== ""
				const isSpaNavigation =
					isGetOrHead &&
					!isInternalPath &&
					!hasExtension &&
					accept.includes("text/html")

				if (
					!useLocalIndex &&
					(urlPath === "/" || urlPath === "/index.html" || isSpaNavigation)
				) {
					const runtimeIndexPath = path.join(runtimeDir, "index.html")
					if (fs.existsSync(runtimeIndexPath)) {
						// Rewrite hard-coded references to runtime assets so they
						// resolve via Vite's /@fs/ handler instead of a guessed
						// /node_modules/... path. This is what makes the same
						// runtime work for local, linked, and global installs.
						let html = fs.readFileSync(runtimeIndexPath, "utf-8")
						html = html
							.split("/node_modules/@gxp-dev/tools/runtime/logo.png")
							.join(runtimeLogoFsUrl)
							.split("/@gx-runtime/main.js")
							.join(useLocalMain ? "/main.js" : runtimeMainFsUrl)
						server
							.transformIndexHtml(rawUrl, html)
							.then((transformed) => {
								res.setHeader("Content-Type", "text/html")
								res.end(transformed)
							})
							.catch((err) => {
								console.error("Error transforming index.html:", err)
								next(err)
							})
						return
					}
				}

				// Back-compat: anything still hitting the legacy
				// `/@gx-runtime/main.js` URL (e.g. a hand-rolled index.html)
				// is redirected to the /@fs/ URL. The old transformRequest
				// approach passed an absolute filesystem path and only worked
				// when runtimeDir was inside process.cwd() — i.e. for local
				// installs but not global ones.
				if (
					!useLocalMain &&
					(urlPath === "/@gx-runtime/main.js" ||
						urlPath.startsWith("/@gx-runtime/main.js"))
				) {
					const query = rawUrl.includes("?")
						? rawUrl.slice(rawUrl.indexOf("?"))
						: ""
					res.statusCode = 302
					res.setHeader("Location", runtimeMainFsUrl + query)
					res.end()
					return
				}

				next()
			})
		},
	}

	// Resolve @layouts: use project's theme-layouts/ if it exists,
	// otherwise fall back to toolkit's runtime/fallback-layouts/
	const projectLayoutsDir = path.resolve(process.cwd(), "theme-layouts")
	const fallbackLayoutsDir = path.resolve(runtimeDir, "fallback-layouts")
	const layoutsDir = fs.existsSync(projectLayoutsDir)
		? projectLayoutsDir
		: fallbackLayoutsDir

	if (layoutsDir === fallbackLayoutsDir) {
		console.log(
			"📐 Layouts: using toolkit fallbacks (no theme-layouts/ directory)",
		)
	} else {
		console.log("📐 Layouts: using project theme-layouts/")
	}

	// Determine if HTTPS is enabled
	const useHttps = getHttpsConfig(env) !== undefined

	// Load Tailwind 4 Vite plugin from the project's node_modules if present.
	// Dev-only — production builds skip it (see loadTailwindPlugin docs).
	const tailwindPlugin = await loadTailwindPlugin(ctx.command)
	if (tailwindPlugin) {
		console.log("🎨 Tailwind: @tailwindcss/vite plugin loaded (dev)")
	}

	// Get API proxy target for non-mock environments
	const apiProxyTarget = getApiProxyTarget(env)
	if (apiProxyTarget) {
		console.log(`🔀 API Proxy: /api-proxy -> ${apiProxyTarget}`)
	}

	const runtimeConfig = {
		// Root is always the project directory
		root: process.cwd(),
		// Expose environment variables to the browser
		define: {
			"import.meta.env.VITE_API_ENV": JSON.stringify(env.API_ENV || "mock"),
			"import.meta.env.VITE_API_BASE_URL": JSON.stringify(
				env.API_BASE_URL || "",
			),
			"import.meta.env.VITE_API_KEY": JSON.stringify(env.API_KEY || ""),
			"import.meta.env.VITE_API_PROJECT_ID": JSON.stringify(
				env.API_PROJECT_ID || "",
			),
			"import.meta.env.VITE_USE_HTTPS": JSON.stringify(
				useHttps ? "true" : "false",
			),
			"import.meta.env.VITE_NODE_PORT": JSON.stringify(env.NODE_PORT || "3060"),
			"import.meta.env.VITE_SOCKET_IO_PORT": JSON.stringify(
				env.SOCKET_IO_PORT || "3069",
			),
			"import.meta.env.SOCKET_URL": JSON.stringify(env.SOCKET_URL || ""),
			"import.meta.env.SOCKET_DRIVER": JSON.stringify(
				env.SOCKET_DRIVER || "io",
			),
		},
		plugins: [
			runtimeFilesPlugin,
			// Tailwind 4 Vite plugin (no-op if @tailwindcss/vite isn't installed).
			...((tailwindPlugin && [tailwindPlugin]) || []),
			// Source tracker must run BEFORE vue() to transform templates before compilation
			...(useSourceTracker ? [gxpSourceTrackerPlugin()] : []),
			vue(),
			// GxP Inspector plugin for browser extension integration
			...(useInspector ? [gxpInspectorPlugin()] : []),
			// `externalGlobals` rewrites `import ... from "vue"` → references to
			// the `Vue` global that the GxP platform exposes on `window`, and
			// `@/stores/gxpPortalConfigStore` imports → `window.useGxpStore`.
			//
			// We want this to run in BOTH dev and build so user source code keeps
			// the same external-store indirection regardless of mode. The only
			// exception is the toolkit's own runtime code (`@gxp-dev/tools/runtime/
			// *.js` and the workspace equivalent) — that code bootstraps its own
			// local Vue + Pinia via main.js (createApp + app.use) and would crash
			// with "getActivePinia() was called" if its `from "pinia"` were
			// rewritten to a non-existent `window.Pinia`.
			//
			// So: exclude the toolkit's runtime from the transform.
			externalGlobals(
				{
					vue: "Vue",
					pinia: "Pinia",
					"@/stores/gxpPortalConfigStore":
						"(window.useGxpStore || (() => { console.warn('useGxpStore not found on window, using fallback'); return {}; }))",
				},
				{
					exclude: [
						// Consumer install (published toolkit from npm)
						"**/node_modules/@gxp-dev/tools/**",
						// Workspace / `npm link` / self-dev: the runtime source itself,
						// resolved via the @gx-runtime alias.
						`${runtimeDir.replace(/\\/g, "/")}/**`,
						// If the toolkit lives at a symlinked path (global install,
						// `npm link`, monorepo workspace), Vite resolves modules to
						// their realpath — match that too so the runtime source is
						// not double-rewritten.
						...(realRuntimeDir !== runtimeDir.replace(/\\/g, "/")
							? [`${realRuntimeDir}/**`]
							: []),
						// `vue-demi` is the Vue 2/3 compat shim that Pinia (and many
						// other libs) pull in transitively. Its `lib/index.mjs` does
						// `export * from "vue"`, which rollup-plugin-external-globals
						// can't rewrite ("Cannot export all properties from an
						// external variable"). Leave it alone — Vite's `dedupe: ["vue"]`
						// already ensures it imports the same Vue instance that we
						// expose on `window.Vue`.
						"**/node_modules/vue-demi/**",
					],
				},
			),
			// Custom request logging and CORS plugin
			{
				name: "request-logger-cors",
				configureServer(server) {
					server.middlewares.use((req, res, next) => {
						// Health check route
						if (req.url === "/__health") {
							res.statusCode = 200
							res.setHeader("Content-Type", "application/json")
							res.end(JSON.stringify({ status: "ok" }))
							return
						}

						const start = Date.now()
						const originalEnd = res.end

						// Add CORS headers to all responses
						res.setHeader("Access-Control-Allow-Origin", "*")
						res.setHeader(
							"Access-Control-Allow-Methods",
							"GET, POST, PUT, DELETE, OPTIONS",
						)
						res.setHeader("Access-Control-Allow-Headers", "*")
						res.setHeader("Access-Control-Allow-Credentials", "false")

						// Handle preflight requests
						if (req.method === "OPTIONS") {
							res.statusCode = 200
							res.end()
							return
						}

						res.end = function (...args) {
							const duration = Date.now() - start
							const status = res.statusCode
							const method = req.method
							const url = req.url
							const referer = req.headers.referer || "direct"
							const origin = req.headers.origin || "unknown"

							console.log(
								`[${new Date().toISOString()}] ${method} ${url} ${status} (${duration}ms) - Origin: ${origin} - Referer: ${referer}`,
							)
							originalEnd.apply(this, args)
						}

						next()
					})
				},
			},
		],
		logLevel: env.NODE_LOG_LEVEL || "error",
		clearScreen: false,
		server: {
			port: parseInt(env.NODE_PORT) || 3060,
			strictPort: true,
			https: getHttpsConfig(env),
			allowedHosts: env.ALLOWED_HOSTS
				? env.ALLOWED_HOSTS.split(",")
						.map((h) => h.trim())
						.filter(Boolean)
				: true,
			cors: {
				origin: "*",
				methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
				allowedHeaders: ["*"],
				credentials: false,
			},
			hmr: env.HMR_HOST
				? {
						protocol: env.HMR_PROTOCOL || "wss",
						host: env.HMR_HOST,
						port:
							parseInt(env.HMR_PORT) ||
							parseInt(env.CLIENT_PORT) ||
							parseInt(env.NODE_PORT) ||
							3060,
						clientPort:
							parseInt(env.HMR_CLIENT_PORT) ||
							parseInt(env.CLIENT_PORT) ||
							parseInt(env.NODE_PORT) ||
							3060,
					}
				: {
						clientPort:
							parseInt(env.CLIENT_PORT) || parseInt(env.NODE_PORT) || 3060,
					},
			host: true, // Allow access from network
			// Allow serving files from the toolkit runtime directory
			// Also resolve symlinks to allow files from the real path
			fs: {
				allow: [process.cwd(), toolkitPath, fs.realpathSync(toolkitPath)],
			},
			// chokidar's native inotify backend misses cross-process writes
			// into mounted volumes — file-gateway writes a .vue file, the
			// kernel fires the event on file-gateway's fd, and Vite (running
			// in a different container in the same pod) never sees it.
			// Result: the file on disk has the new content but Vite's
			// transformRequest cache keeps serving the old transform to
			// every browser, indefinitely, until the pod restarts.
			//
			// Polling fixes this. The 200ms interval keeps perceived edit
			// latency low; binaryInterval is bumped because images/fonts
			// don't need fast detection. Setting both via env so a local
			// host-mode dev run (where native inotify works fine) can opt
			// out with VITE_USE_POLLING=false.
			watch: {
				usePolling: env.VITE_USE_POLLING !== "false",
				interval: parseInt(env.VITE_WATCH_INTERVAL) || 200,
				binaryInterval: parseInt(env.VITE_WATCH_BINARY_INTERVAL) || 1000,
			},
			// API proxy for non-mock environments
			proxy: apiProxyTarget
				? {
						"/api-proxy": {
							target: apiProxyTarget,
							changeOrigin: true,
							rewrite: (path) => path.replace(/^\/api-proxy/, ""),
							secure: false,
							configure: (proxy, options) => {
								proxy.on("proxyReq", (proxyReq, req) => {
									// Forward the API key as Authorization header if set
									const apiKey = env.API_KEY
									if (apiKey) {
										proxyReq.setHeader("Authorization", `Bearer ${apiKey}`)
									}
									console.log(
										`[API Proxy] ${req.method} ${
											req.url
										} -> ${apiProxyTarget}${req.url.replace(
											/^\/api-proxy/,
											"",
										)}`,
									)
								})
								proxy.on("proxyRes", (proxyRes, req) => {
									console.log(
										`[API Proxy] ${req.method} ${req.url} <- ${proxyRes.statusCode}`,
									)
								})
								proxy.on("error", (err, req) => {
									console.error(`[API Proxy] Error: ${err.message}`)
								})
							},
						},
					}
				: {},
		},
		build: {
			// Build output goes to project directory
			outDir: path.resolve(process.cwd(), "dist"),
			lib: {
				entry: [
					path.resolve(process.cwd(), env.COMPONENT_PATH || "./src/Plugin.vue"),
				],
				name: libName,
				fileName: (format) => `plugin.${format}.js`,
				cssFileName: "style",
				formats: ["es"],
			},
			rollupOptions: {
				// Make sure Vue and Pinia are treated as external dependencies
				external: ["vue", "pinia"],
				output: {
					globals: {
						vue: "Vue",
						pinia: "Pinia",
					},
				},
			},
		},
		resolve: {
			alias: {
				// Client project's source directory
				"@": path.resolve(process.cwd(), "src"),
				// Theme layouts in client project
				"@layouts": layoutsDir,
				// GxP Toolkit runtime (PortalContainer, etc.) - from node_modules
				"@gx-runtime": runtimeDir,
				// Ensure single Vue and Pinia instances
				vue: path.resolve(process.cwd(), "node_modules/vue"),
				pinia: path.resolve(process.cwd(), "node_modules/pinia"),
			},
			// Dedupe Vue and Pinia to ensure only one instance is used
			dedupe: ["vue", "pinia"],
		},
		// Pre-bundle deps once at server start so their optimize-deps hash is
		// stable for the whole session — lazy discovery churns the hash and
		// breaks the cross-origin portal embed. `entries` makes the startup
		// scan crawl the plugin's source (it has no root index.html), and
		// `include` force-pre-bundles our linked @gxp-dev/* libraries that
		// Vite won't pre-bundle otherwise. See the two helpers for details.
		optimizeDeps: {
			include: getOptimizeDepsInclude(),
			entries: getOptimizeDepsEntries(env),
		},
		// SSR configuration to handle externals properly
		ssr: {
			external: ["vue", "pinia"],
		},
	}

	const extension = await loadExtensionConfig(ctx, runtimeConfig)
	return extension ? mergeConfig(runtimeConfig, extension) : runtimeConfig
})
