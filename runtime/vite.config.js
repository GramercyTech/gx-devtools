import { defineConfig, loadEnv, mergeConfig } from "vite";
import { fileURLToPath, pathToFileURL } from "url";
import vue from "@vitejs/plugin-vue";
import path from "path";
import fs from "fs";
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
    return undefined;
  }

  // Resolve paths relative to project root
  const resolvedCertPath = path.resolve(process.cwd(), certPath);
  const resolvedKeyPath = path.resolve(process.cwd(), keyPath);

  // Check if certificate files exist
  if (!fs.existsSync(resolvedCertPath) || !fs.existsSync(resolvedKeyPath)) {
    console.warn("⚠ SSL certificate files not found, falling back to HTTP");
    return undefined;
  }

  try {
    return {
      key: fs.readFileSync(resolvedKeyPath),
      cert: fs.readFileSync(resolvedCertPath),
    };
  } catch (error) {
    console.warn("⚠ Failed to read SSL certificates, falling back to HTTP");
    return undefined;
  }
}

/**
 * Find the gx-devtools package directory (works for both local and global installs)
 */
function findToolkitPath() {
  // Derive from this config file's own location — always reliable regardless
  // of how the package is installed (local, global, npm link, CI, etc.)
  // This file lives at <toolkit>/runtime/vite.config.js, so toolkit root is one level up.
  const configFileDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(configFileDir, "..");
}

/**
 * Check if a file exists locally in the project
 */
function hasLocalFile(fileName) {
  const localPath = path.resolve(process.cwd(), fileName);
  return fs.existsSync(localPath);
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
async function loadExtensionConfig(ctx, runtimeConfig) {
  const candidates = ["vite.extend.js", "vite.extend.mjs"];
  for (const name of candidates) {
    const abs = path.resolve(process.cwd(), name);
    if (!fs.existsSync(abs)) {
      continue;
    }
    try {
      const mod = await import(pathToFileURL(abs).href);
      const exported = mod.default ?? mod;
      const extension =
        typeof exported === "function"
          ? await exported({ ...ctx, runtimeConfig })
          : exported;
      if (extension && typeof extension === "object") {
        console.log(`🧩 Loaded ${name}`);
        return extension;
      }
    } catch (err) {
      console.warn(`⚠ Failed to load ${name}:`, err.message);
    }
    return null;
  }
  return null;
}

export default defineConfig(async (ctx) => {
  const { mode } = ctx;
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

  // Plugin enable/disable flags
  const useSourceTracker = env.DISABLE_SOURCE_TRACKER !== "true";
  const useInspector = env.DISABLE_INSPECTOR !== "true";

  // Log which files are being used
  console.log(`📄 index.html: ${useLocalIndex ? "local" : "runtime"}`);
  console.log(`📄 main.js: ${useLocalMain ? "local" : "runtime"}`);

  // Create plugin to serve runtime files (index.html and main.js) if no local ones exist
  const runtimeFilesPlugin = {
    name: "runtime-files",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Serve runtime index.html for root requests and SPA navigation requests
        // (unless local index.html is opted in). SPA fallback is required so
        // client-side routers (e.g. vue-router createWebHistory) can handle
        // deep links when no physical index.html exists at the project root.
        const rawUrl = req.url || "";
        const urlPath = rawUrl.split("?")[0];
        const accept = req.headers.accept || "";
        const isGetOrHead = req.method === "GET" || req.method === "HEAD";
        const isInternalPath =
          urlPath.startsWith("/@") ||
          urlPath.startsWith("/__") ||
          urlPath.startsWith("/node_modules/") ||
          urlPath.startsWith("/src/") ||
          urlPath.startsWith("/dev-assets/") ||
          urlPath.startsWith("/api-proxy/");
        const hasExtension = path.extname(urlPath) !== "";
        const isSpaNavigation =
          isGetOrHead &&
          !isInternalPath &&
          !hasExtension &&
          accept.includes("text/html");

        if (
          !useLocalIndex &&
          (urlPath === "/" || urlPath === "/index.html" || isSpaNavigation)
        ) {
          const runtimeIndexPath = path.join(runtimeDir, "index.html");
          if (fs.existsSync(runtimeIndexPath)) {
            // Read and transform the runtime index.html
            server
              .transformIndexHtml(
                rawUrl,
                fs.readFileSync(runtimeIndexPath, "utf-8"),
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

  // Resolve @layouts: use project's theme-layouts/ if it exists,
  // otherwise fall back to toolkit's runtime/fallback-layouts/
  const projectLayoutsDir = path.resolve(process.cwd(), "theme-layouts");
  const fallbackLayoutsDir = path.resolve(runtimeDir, "fallback-layouts");
  const layoutsDir = fs.existsSync(projectLayoutsDir)
    ? projectLayoutsDir
    : fallbackLayoutsDir;

  if (layoutsDir === fallbackLayoutsDir) {
    console.log(
      "📐 Layouts: using toolkit fallbacks (no theme-layouts/ directory)",
    );
  } else {
    console.log("📐 Layouts: using project theme-layouts/");
  }

  // Determine if HTTPS is enabled
  const useHttps = getHttpsConfig(env) !== undefined;

  // Get API proxy target for non-mock environments
  const apiProxyTarget = getApiProxyTarget(env);
  if (apiProxyTarget) {
    console.log(`🔀 API Proxy: /api-proxy -> ${apiProxyTarget}`);
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
      // Source tracker must run BEFORE vue() to transform templates before compilation
      ...(useSourceTracker ? [gxpSourceTrackerPlugin()] : []),
      vue(),
      // GxP Inspector plugin for browser extension integration
      ...(useInspector ? [gxpInspectorPlugin()] : []),
      externalGlobals(
        {
          vue: "Vue",
          pinia: "Pinia",
          "@/stores/gxpPortalConfigStore":
            "(window.useGxpStore || (() => { console.warn('useGxpStore not found on window, using fallback'); return {}; }))",
        },
        {
          include: ["src/**"],
        },
      ),
      // Custom request logging and CORS plugin
      {
        name: "request-logger-cors",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            // Health check route
            if (req.url === "/__health") {
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ status: "ok" }));
              return;
            }

            const start = Date.now();
            const originalEnd = res.end;

            // Add CORS headers to all responses
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader(
              "Access-Control-Allow-Methods",
              "GET, POST, PUT, DELETE, OPTIONS",
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
                `[${new Date().toISOString()}] ${method} ${url} ${status} (${duration}ms) - Origin: ${origin} - Referer: ${referer}`,
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
                      "",
                    )}`,
                  );
                });
                proxy.on("proxyRes", (proxyRes, req) => {
                  console.log(
                    `[API Proxy] ${req.method} ${req.url} <- ${proxyRes.statusCode}`,
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
    // Force Vite to pre-bundle these dependencies to ensure single instances
    optimizeDeps: {
      include: ["vue", "pinia"],
    },
    // SSR configuration to handle externals properly
    ssr: {
      external: ["vue", "pinia"],
    },
  };

  const extension = await loadExtensionConfig(ctx, runtimeConfig);
  return extension ? mergeConfig(runtimeConfig, extension) : runtimeConfig;
});
