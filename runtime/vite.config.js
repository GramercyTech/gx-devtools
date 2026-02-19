import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import externalGlobals from "rollup-plugin-external-globals";
import { gxpInspectorPlugin } from "./vite-inspector-plugin.js";
import { gxpSourceTrackerPlugin } from "./vite-source-tracker-plugin.js";

// Environment URL configuration for API proxy
const ENVIRONMENT_URLS = {
	production: "https://api.gramercy.cloud",
	staging: "https://api.efz-staging.env.eventfinity.app",
	testing: "https://api.zenith-develop-testing.env.eventfinity.app",
	develop: "https://api.zenith-develop.env.eventfinity.app",
	local: "https://dashboard.eventfinity.test",
};

/**
 * Get the API proxy target URL based on environment
 */
function getApiProxyTarget(env) {
	const apiEnv = env.API_ENV || "mock";

	// Custom URL takes precedence
	if (env.API_BASE_URL) {
		return env.API_BASE_URL;
	}

	// Mock uses local mock-api server (no proxy needed, handled separately)
	if (apiEnv === "mock") {
		return null;
	}

	// Look up environment URL
	return ENVIRONMENT_URLS[apiEnv] || ENVIRONMENT_URLS.production;
}

/**
 * Get the library name from package.json
 */
function getLibName() {
	try {
		const packageJsonPath = path.resolve(process.cwd(), "package.json");
		if (fs.existsSync(packageJsonPath)) {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
			// Convert package name to a valid JS identifier
			// e.g., "@company/my-plugin" -> "MyPlugin"
			const name = packageJson.name || "Plugin";
			return name
				.replace(/[@\/\-]/g, " ")
				.replace(/\b\w/g, (l) => l.toUpperCase())
				.replace(/\s/g, "");
		}
	} catch (error) {
		console.warn("Could not read package.json, using default lib name");
	}
	return "Plugin";
}

/**
 * Setup HTTPS configuration if certificates are available
 */
function getHttpsConfig(env) {
	const useHttps = env.USE_HTTPS === "true";
	const certPath = env.CERT_PATH;
	const keyPath = env.KEY_PATH;

	if (!useHttps || !certPath || !keyPath) {
		return false;
	}

	// Resolve paths relative to project root
	const resolvedCertPath = path.resolve(process.cwd(), certPath);
	const resolvedKeyPath = path.resolve(process.cwd(), keyPath);

	// Check if certificate files exist
	if (!fs.existsSync(resolvedCertPath) || !fs.existsSync(resolvedKeyPath)) {
		console.warn("⚠ SSL certificate files not found, falling back to HTTP");
		return false;
	}

	try {
		return {
			key: fs.readFileSync(resolvedKeyPath),
			cert: fs.readFileSync(resolvedCertPath),
		};
	} catch (error) {
		console.warn("⚠ Failed to read SSL certificates, falling back to HTTP");
		return false;
	}
}

/**
 * Find the gx-devtools package directory (works for both local and global installs)
 */
function findToolkitPath() {
	const packageName = "@gxp-dev/tools";

	// Try local node_modules first
	const localPath = path.resolve(process.cwd(), "node_modules", packageName);
	if (fs.existsSync(localPath)) {
		return localPath;
	}

	// Try to find via require.resolve
	try {
		const pkgPath = require.resolve(`${packageName}/package.json`);
		return path.dirname(pkgPath);
	} catch (e) {
		// Fallback: assume we're in the toolkit itself during development
		return process.cwd();
	}
}

/**
 * Check if a file exists locally in the project
 */
function hasLocalFile(fileName) {
	const localPath = path.resolve(process.cwd(), fileName);
	return fs.existsSync(localPath);
}

export default defineConfig(({ mode }) => {
	// Load environment variables from project directory
	const env = loadEnv(mode, process.cwd(), "");

	// Get lib name from package.json
	const libName = getLibName();

	// Find the toolkit path for runtime imports
	const toolkitPath = findToolkitPath();
	const runtimeDir = path.resolve(toolkitPath, "runtime");

	// Check for local dev files (requires both env var AND file to exist)
	const hasLocalIndexHtml = hasLocalFile("index.html");
	const hasLocalMainJs = hasLocalFile("main.js");
	const useLocalIndex = env.USE_LOCAL_INDEX === "true" && hasLocalIndexHtml;
	const useLocalMain = env.USE_LOCAL_MAIN === "true" && hasLocalMainJs;

	// Log which files are being used
	console.log(`📄 index.html: ${useLocalIndex ? "local" : "runtime"}`);
	console.log(`📄 main.js: ${useLocalMain ? "local" : "runtime"}`);

	// Create plugin to serve runtime files (index.html and main.js) if no local ones exist
	const runtimeFilesPlugin = {
		name: "runtime-files",
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				// Serve runtime index.html for root requests (unless local index.html is opted in)
				if (
					!useLocalIndex &&
					(req.url === "/" || req.url === "/index.html")
				) {
					const runtimeIndexPath = path.join(runtimeDir, "index.html");
					if (fs.existsSync(runtimeIndexPath)) {
						// Read and transform the runtime index.html
						server
							.transformIndexHtml(
								req.url,
								fs.readFileSync(runtimeIndexPath, "utf-8")
							)
							.then((html) => {
								res.setHeader("Content-Type", "text/html");
								res.end(html);
							})
							.catch((err) => {
								console.error("Error transforming index.html:", err);
								next(err);
							});
						return;
					}
				}

				// Serve runtime main.js for @gx-runtime/main.js requests (unless local main.js is opted in)
				if (
					!useLocalMain &&
					(req.url === "/@gx-runtime/main.js" ||
						req.url?.startsWith("/@gx-runtime/main.js?"))
				) {
					const runtimeMainPath = path.join(runtimeDir, "main.js");
					if (fs.existsSync(runtimeMainPath)) {
						// Use the real path to handle symlinks correctly
						const realMainPath = fs.realpathSync(runtimeMainPath);
						server
							.transformRequest(realMainPath)
							.then((result) => {
								if (result) {
									res.setHeader("Content-Type", "application/javascript");
									res.end(result.code);
								} else {
									next();
								}
							})
							.catch((err) => {
								console.error("Error transforming main.js:", err);
								next(err);
							});
						return;
					}
				}

				next();
			});
		},
	};

	// Fallback plugin for missing @layouts files
	// When a project doesn't have theme-layouts/, serve minimal fallbacks
	// so PortalContainer.vue imports don't break
	const layoutsDir = path.resolve(process.cwd(), "theme-layouts");
	const layoutFallbackPlugin = {
		name: "gxp-layout-fallback",
		resolveId(source) {
			// Only handle @layouts/ imports
			if (!source.startsWith("@layouts/")) return null;

			const fileName = source.replace("@layouts/", "");
			const localFile = path.resolve(layoutsDir, fileName);

			// If the file exists locally, let Vite resolve it normally
			if (fs.existsSync(localFile)) return null;

			// Return a virtual module ID for the missing file
			return `\0gxp-layout-fallback:${fileName}`;
		},
		load(id) {
			if (!id.startsWith("\0gxp-layout-fallback:")) return null;

			const fileName = id.replace("\0gxp-layout-fallback:", "");
			console.log(`⚡ [GxP] Serving fallback for missing layout: ${fileName}`);

			// CSS files get empty content
			if (fileName.endsWith(".css")) {
				return "/* GxP fallback: no local AdditionalStyling.css */";
			}

			// Vue layout components get a passthrough slot wrapper
			if (fileName.endsWith(".vue")) {
				return `
<template><slot /></template>
<script setup>
defineOptions({ inheritAttrs: false });
defineProps({
	usrLang: { type: String, default: "" },
	portalSettings: { type: Object, default: () => ({}) },
	portalLanguage: { type: Object, default: () => ({}) },
	portalNavigation: { type: Array, default: () => ([]) },
	portalAssets: { type: Object, default: () => ({}) },
});
</script>`;
			}

			return "";
		},
	};

	// Determine if HTTPS is enabled
	const useHttps = getHttpsConfig(env) !== false;

	// Get API proxy target for non-mock environments
	const apiProxyTarget = getApiProxyTarget(env);
	if (apiProxyTarget) {
		console.log(`🔀 API Proxy: /api-proxy -> ${apiProxyTarget}`);
	}

	return {
		// Root is always the project directory
		root: process.cwd(),
		// Expose environment variables to the browser
		define: {
			"import.meta.env.VITE_API_ENV": JSON.stringify(env.API_ENV || "mock"),
			"import.meta.env.VITE_API_BASE_URL": JSON.stringify(
				env.API_BASE_URL || ""
			),
			"import.meta.env.VITE_API_KEY": JSON.stringify(env.API_KEY || ""),
			"import.meta.env.VITE_API_PROJECT_ID": JSON.stringify(
				env.API_PROJECT_ID || ""
			),
			"import.meta.env.VITE_USE_HTTPS": JSON.stringify(
				useHttps ? "true" : "false"
			),
			"import.meta.env.VITE_NODE_PORT": JSON.stringify(env.NODE_PORT || "3060"),
			"import.meta.env.VITE_SOCKET_IO_PORT": JSON.stringify(
				env.SOCKET_IO_PORT || "3069"
			),
		},
		plugins: [
			runtimeFilesPlugin,
			// Layout fallback must run before vue() to resolve missing @layouts/ imports
			layoutFallbackPlugin,
			// Source tracker must run BEFORE vue() to transform templates before compilation
			gxpSourceTrackerPlugin(),
			vue(),
			// GxP Inspector plugin for browser extension integration
			gxpInspectorPlugin(),
			externalGlobals(
				{
					vue: "Vue",
					pinia: "Pinia",
					"@/stores/gxpPortalConfigStore":
						"(window.useGxpStore || (() => { console.warn('useGxpStore not found on window, using fallback'); return {}; }))",
				},
				{
					include: ["src/**"],
				}
			),
			// Custom request logging and CORS plugin
			{
				name: "request-logger-cors",
				configureServer(server) {
					server.middlewares.use((req, res, next) => {
						const start = Date.now();
						const originalEnd = res.end;

						// Add CORS headers to all responses
						res.setHeader("Access-Control-Allow-Origin", "*");
						res.setHeader(
							"Access-Control-Allow-Methods",
							"GET, POST, PUT, DELETE, OPTIONS"
						);
						res.setHeader("Access-Control-Allow-Headers", "*");
						res.setHeader("Access-Control-Allow-Credentials", "false");

						// Handle preflight requests
						if (req.method === "OPTIONS") {
							res.statusCode = 200;
							res.end();
							return;
						}

						res.end = function (...args) {
							const duration = Date.now() - start;
							const status = res.statusCode;
							const method = req.method;
							const url = req.url;
							const referer = req.headers.referer || "direct";
							const origin = req.headers.origin || "unknown";

							console.log(
								`[${new Date().toISOString()}] ${method} ${url} ${status} (${duration}ms) - Origin: ${origin} - Referer: ${referer}`
							);
							originalEnd.apply(this, args);
						};

						next();
					});
				},
			},
		],
		logLevel: env.NODE_LOG_LEVEL || "error",
		clearScreen: false,
		server: {
			port: parseInt(env.NODE_PORT) || 3060,
			strictPort: true,
			https: getHttpsConfig(env),
			cors: {
				origin: "*",
				methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
				allowedHeaders: ["*"],
				credentials: false,
			},
			hmr: {
				clientPort:
					parseInt(env.CLIENT_PORT) || parseInt(env.NODE_PORT) || 3060,
			},
			host: true, // Allow access from network
			// Allow serving files from the toolkit runtime directory
			// Also resolve symlinks to allow files from the real path
			fs: {
				allow: [process.cwd(), toolkitPath, fs.realpathSync(toolkitPath)],
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
									const apiKey = env.API_KEY;
									if (apiKey) {
										proxyReq.setHeader("Authorization", `Bearer ${apiKey}`);
									}
									console.log(
										`[API Proxy] ${req.method} ${
											req.url
										} -> ${apiProxyTarget}${req.url.replace(
											/^\/api-proxy/,
											""
										)}`
									);
								});
								proxy.on("proxyRes", (proxyRes, req) => {
									console.log(
										`[API Proxy] ${req.method} ${req.url} <- ${proxyRes.statusCode}`
									);
								});
								proxy.on("error", (err, req) => {
									console.error(`[API Proxy] Error: ${err.message}`);
								});
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
				"@layouts": path.resolve(process.cwd(), "theme-layouts"),
				// GxP Toolkit runtime (PortalContainer, etc.) - from node_modules
				"@gx-runtime": runtimeDir,
				// Ensure single Vue and Pinia instances
				vue: path.resolve(process.cwd(), "node_modules/vue"),
				pinia: path.resolve(process.cwd(), "node_modules/pinia"),
			},
			// Dedupe Vue and Pinia to ensure only one instance is used
			dedupe: ["vue", "pinia"],
		},
		// Force Vite to pre-bundle these dependencies to ensure single instances
		optimizeDeps: {
			include: ["vue", "pinia"],
		},
		// SSR configuration to handle externals properly
		ssr: {
			external: ["vue", "pinia"],
		},
	};
});
