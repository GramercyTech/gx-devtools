/**
 * Mock API Server
 *
 * Main entry point for the mock API functionality.
 * Creates an Express router that mounts onto the existing server.
 */

const express = require("express");
const {
	loadSpecs,
	refreshSpecs,
	getCacheStatus,
	getCachedSpecs,
} = require("./spec-loader");
const { generateRoutes, getRouteStats } = require("./route-generator");
const { parseSocketTriggers, getTriggerStats } = require("./socket-triggers");
const { imageHandler } = require("./image-generator");

// Store state for status endpoint
let currentSpecs = null;
let currentSocketTriggers = null;
let routeStats = null;

/**
 * Create the mock API router
 * @param {object} io - Socket.IO server instance
 * @param {object} options - Options
 * @param {string} options.projectRoot - Project root directory
 * @returns {express.Router} Express router
 */
async function createMockApiRouter(io, options = {}) {
	const router = express.Router();
	const projectRoot = options.projectRoot || process.cwd();

	console.log("\n🎭 Initializing Mock API Server...");

	// Load specs
	const specs = await loadSpecs(projectRoot);
	currentSpecs = specs;

	// Parse socket triggers from AsyncAPI
	if (specs.asyncApi) {
		currentSocketTriggers = parseSocketTriggers(specs.asyncApi);
	}

	// Generate routes from OpenAPI
	if (specs.openApi) {
		console.log("\n📍 Generating mock routes from OpenAPI spec:");
		const apiRouter = generateRoutes(specs.openApi, {
			io,
			socketTriggers: currentSocketTriggers,
		});
		routeStats = getRouteStats(specs.openApi);

		// Mount API routes under /api
		router.use("/api", apiRouter);
	} else {
		console.log("⚠️  No OpenAPI spec available, mock API routes not generated");
		routeStats = { total: 0, byMethod: {}, paths: [] };
	}

	// Status endpoint
	router.get("/_mock/status", (req, res) => {
		const cacheStatus = getCacheStatus();
		const triggerStats = getTriggerStats(currentSocketTriggers);

		res.json({
			enabled: true,
			environment: process.env.API_ENV || "production",
			specs: {
				openApi: !!currentSpecs?.openApi,
				asyncApi: !!currentSpecs?.asyncApi,
				webhooks: !!currentSpecs?.webhooks,
			},
			routes: routeStats,
			socketTriggers: triggerStats,
			cache: cacheStatus,
		});
	});

	// Refresh endpoint
	router.post("/_mock/refresh", async (req, res) => {
		console.log("\n🔄 Refreshing mock API specs...");

		try {
			const newSpecs = await refreshSpecs(projectRoot);
			currentSpecs = newSpecs;

			// Re-parse socket triggers
			if (newSpecs.asyncApi) {
				currentSocketTriggers = parseSocketTriggers(newSpecs.asyncApi);
			}

			// Update route stats
			if (newSpecs.openApi) {
				routeStats = getRouteStats(newSpecs.openApi);
			}

			res.json({
				success: true,
				message: "Specs refreshed successfully",
				specs: {
					openApi: !!newSpecs.openApi,
					asyncApi: !!newSpecs.asyncApi,
					webhooks: !!newSpecs.webhooks,
				},
			});
		} catch (error) {
			console.error("❌ Failed to refresh specs:", error.message);
			res.status(500).json({
				success: false,
				error: error.message,
			});
		}
	});

	// Image generation endpoints
	router.get("/_mock/image/:width/:height", imageHandler);
	router.get("/_mock/image/:width", imageHandler); // Square or WxH format

	// Info endpoint
	router.get("/_mock/info", (req, res) => {
		res.json({
			name: "GxP Toolkit Mock API",
			version: "1.0.0",
			description: "Mock API server based on OpenAPI/AsyncAPI specs",
			endpoints: {
				status: "GET /_mock/status",
				refresh: "POST /_mock/refresh",
				image: "GET /_mock/image/:width/:height",
				api: "* /api/*",
			},
			configuration: {
				API_ENV: process.env.API_ENV || "production",
				MOCK_API_DELAY: process.env.MOCK_API_DELAY || "0",
				MOCK_API_CACHE_TTL: process.env.MOCK_API_CACHE_TTL || "300000",
			},
		});
	});

	// Spec endpoints (for debugging)
	router.get("/_mock/specs/openapi", (req, res) => {
		if (currentSpecs?.openApi) {
			res.json(currentSpecs.openApi);
		} else {
			res.status(404).json({ error: "OpenAPI spec not loaded" });
		}
	});

	router.get("/_mock/specs/asyncapi", (req, res) => {
		if (currentSpecs?.asyncApi) {
			res.json(currentSpecs.asyncApi);
		} else {
			res.status(404).json({ error: "AsyncAPI spec not loaded" });
		}
	});

	router.get("/_mock/specs/webhooks", (req, res) => {
		if (currentSpecs?.webhooks) {
			res.json(currentSpecs.webhooks);
		} else {
			res.status(404).json({ error: "Webhook spec not loaded" });
		}
	});

	console.log("\n✅ Mock API Server initialized");
	console.log("   Status: GET /_mock/status");
	console.log("   Refresh: POST /_mock/refresh");
	console.log("   Images: GET /_mock/image/:width/:height");
	if (routeStats?.total > 0) {
		console.log(`   API Routes: ${routeStats.total} endpoints under /api/*`);
	}

	return router;
}

/**
 * Get current specs (for external access)
 * @returns {object} Current specs
 */
function getSpecs() {
	return currentSpecs;
}

/**
 * Get current socket triggers (for external access)
 * @returns {object} Current socket triggers
 */
function getSocketTriggers() {
	return currentSocketTriggers;
}

module.exports = {
	createMockApiRouter,
	getSpecs,
	getSocketTriggers,
};
