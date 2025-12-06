import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import fs from "fs";
import externalGlobals from "rollup-plugin-external-globals";

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
 * Find the gx-toolkit package directory (works for both local and global installs)
 */
function findToolkitPath() {
	const packageName = "@gramercytech/gx-toolkit";

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

// Dynamically import the inspector plugin from the toolkit
let gxpInspectorPlugin;
let gxpSourceTrackerPlugin;
try {
	const toolkitPathForPlugin = findToolkitPath();
	const pluginPath = path.join(toolkitPathForPlugin, "runtime/vite-inspector-plugin.js");
	if (fs.existsSync(pluginPath)) {
		const pluginModule = await import(pluginPath);
		gxpInspectorPlugin = pluginModule.gxpInspectorPlugin;
	}
	// Load source tracker plugin for injecting data-gxp-source attributes
	const trackerPath = path.join(toolkitPathForPlugin, "runtime/vite-source-tracker-plugin.js");
	if (fs.existsSync(trackerPath)) {
		const trackerModule = await import(trackerPath);
		gxpSourceTrackerPlugin = trackerModule.gxpSourceTrackerPlugin;
	}
} catch (e) {
	console.warn("Could not load GxP Inspector plugin:", e.message);
}

export default defineConfig(({ mode }) => {
	// Load environment variables
	const env = loadEnv(mode, process.cwd(), "");

	// Get lib name from package.json
	const libName = getLibName();

	// Find the toolkit path for runtime imports
	const toolkitPath = findToolkitPath();

	return {
		plugins: [
			// Source tracker must come before vue() to transform templates before compilation
			...(gxpSourceTrackerPlugin ? [gxpSourceTrackerPlugin()] : []),
			vue(),
			// GxP Inspector plugin for browser extension integration (if available)
			...(gxpInspectorPlugin ? [gxpInspectorPlugin()] : []),
			externalGlobals(
				{
					vue: "Vue",
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
		},
		build: {
			lib: {
				entry: [env.COMPONENT_PATH || "./src/Plugin.vue"],
				name: libName,
				fileName: (format) => `plugin.${format}.js`,
				formats: ["es"],
			},
			rollupOptions: {
				// Make sure Vue and component kit are treated as external dependencies
				external: ["vue"],
				output: {
					globals: {
						vue: "Vue",
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
				"@gx-runtime": path.resolve(toolkitPath, "runtime"),
				// Ensure single Vue instance
				vue: path.resolve(process.cwd(), "node_modules/vue"),
			},
			// Dedupe Vue to ensure only one instance is used
			dedupe: ["vue"],
		},
		// SSR configuration to handle externals properly
		ssr: {
			external: ["vue"],
		},
	};
});
