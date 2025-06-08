import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import fs from "fs";
import externalGlobals from "rollup-plugin-external-globals";

// https://www.npmjs.com/package/rollup-plugin-external-globals

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

export default defineConfig(({ mode }) => {
	// Load environment variables
	const env = loadEnv(mode, process.cwd(), "");

	// Get lib name from package.json
	const libName = getLibName();

	return {
		plugins: [
			vue(),
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
		},
		resolve: {
			alias: {
				"@": path.resolve(process.cwd(), "src"),
				vue: path.resolve("./node_modules/vue"),
			},
		},
	};
});
