/**
 * Route Generator
 *
 * Generates Express routes from OpenAPI path definitions.
 * Supports x-mock extensions for delays, error simulation, and scenarios.
 */

const express = require("express");
const { generateResponse, generateErrorResponse } = require("./response-generator");
const { createAuthMiddleware } = require("./auth-middleware");

// HTTP methods supported by Express
const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];

/**
 * Convert OpenAPI path to Express path
 * e.g., /events/{eventId}/checkin -> /events/:eventId/checkin
 * @param {string} openApiPath - OpenAPI path with {param} syntax
 * @returns {string} Express path with :param syntax
 */
function convertPath(openApiPath) {
	return openApiPath.replace(/\{([^}]+)\}/g, ":$1");
}

/**
 * Get response schema for a given status code
 * @param {object} operation - OpenAPI operation object
 * @param {number} status - HTTP status code
 * @returns {object|null} Response schema
 */
function getResponseSchema(operation, status) {
	if (!operation.responses) {
		return null;
	}

	// Try exact status code
	if (operation.responses[status]) {
		return operation.responses[status];
	}

	// Try wildcard (2XX, 4XX, etc.)
	const wildcard = `${Math.floor(status / 100)}XX`;
	if (operation.responses[wildcard]) {
		return operation.responses[wildcard];
	}

	// Try default
	if (operation.responses.default) {
		return operation.responses.default;
	}

	return null;
}

/**
 * Get the default success status code for an operation
 * @param {string} method - HTTP method
 * @param {object} operation - OpenAPI operation
 * @returns {number} Status code
 */
function getSuccessStatus(method, operation) {
	const responses = operation.responses || {};

	// Check for explicit success codes
	for (const code of ["200", "201", "202", "204"]) {
		if (responses[code]) {
			return parseInt(code);
		}
	}

	// Default by method
	if (method === "post") return 201;
	if (method === "delete") return 204;
	return 200;
}

/**
 * Apply delay if configured
 * @param {object} mockConfig - x-mock configuration
 * @returns {Promise} Resolves after delay
 */
function applyDelay(mockConfig) {
	const delay = mockConfig.delay || parseInt(process.env.MOCK_API_DELAY) || 0;

	if (delay > 0) {
		return new Promise((resolve) => setTimeout(resolve, delay));
	}

	return Promise.resolve();
}

/**
 * Determine if this request should simulate an error
 * @param {object} mockConfig - x-mock configuration
 * @returns {boolean} True if should error
 */
function shouldSimulateError(mockConfig) {
	const errorRate = mockConfig.errorRate || 0;

	if (errorRate <= 0) return false;
	if (errorRate >= 1) return true;

	return Math.random() < errorRate;
}

/**
 * Select a scenario based on weights
 * @param {object} scenarios - Scenario definitions
 * @returns {object|null} Selected scenario or null
 */
function selectScenario(scenarios) {
	if (!scenarios || typeof scenarios !== "object") {
		return null;
	}

	const entries = Object.entries(scenarios);
	if (entries.length === 0) return null;

	// Calculate total weight
	const totalWeight = entries.reduce(
		(sum, [, config]) => sum + (config.weight || 1),
		0
	);

	// Random selection
	let random = Math.random() * totalWeight;

	for (const [name, config] of entries) {
		const weight = config.weight || 1;
		random -= weight;

		if (random <= 0) {
			return { name, ...config };
		}
	}

	// Fallback to first scenario
	const [name, config] = entries[0];
	return { name, ...config };
}

/**
 * Build a route handler for an OpenAPI operation
 * @param {string} method - HTTP method
 * @param {string} path - Original OpenAPI path
 * @param {object} operation - OpenAPI operation object
 * @param {object} spec - Full OpenAPI spec
 * @param {object} options - Additional options (io for socket triggers)
 * @returns {function} Express route handler
 */
function buildRouteHandler(method, path, operation, spec, options = {}) {
	const { io, socketTriggers } = options;

	return async (req, res) => {
		const mockConfig = operation["x-mock"] || {};
		const operationId = operation.operationId || `${method.toUpperCase()} ${path}`;

		console.log(`🎭 Mock API: ${operationId}`);

		try {
			// Apply delay
			await applyDelay(mockConfig);

			// Check for scenario mode
			const scenario = selectScenario(mockConfig.scenarios);

			// Determine if we should simulate an error
			if (shouldSimulateError(mockConfig)) {
				const errorSchema = getResponseSchema(operation, 500);
				const errorBody = errorSchema
					? generateResponse(errorSchema, spec)
					: generateErrorResponse(500, "Simulated server error");

				console.log(`   ⚠️  Simulated error (errorRate: ${mockConfig.errorRate})`);
				return res.status(500).json(errorBody);
			}

			// Use scenario status if defined
			const status = scenario?.status || getSuccessStatus(method, operation);

			// Get response schema for this status
			const responseSchema = getResponseSchema(operation, status);

			// Generate response body
			let body;
			if (status === 204) {
				// No content
				body = undefined;
			} else if (scenario?.response) {
				// Use scenario-defined response
				body = scenario.response;
			} else if (responseSchema) {
				body = generateResponse(responseSchema, spec);
			} else {
				body = { success: true };
			}

			// Log response info
			if (scenario) {
				console.log(`   📋 Scenario: ${scenario.name}`);
			}
			console.log(`   ✅ Status: ${status}`);

			// Send response
			if (status === 204) {
				res.status(204).end();
			} else {
				res.status(status).json(body);
			}

			// Trigger socket events if configured
			if (io && socketTriggers) {
				const { triggerSocketEvents } = require("./socket-triggers");
				const operationKey = `${method.toUpperCase()} ${path}`;

				triggerSocketEvents(io, socketTriggers, operationKey, {
					request: {
						method: req.method,
						path: req.path,
						params: req.params,
						query: req.query,
						body: req.body,
					},
					response: {
						status,
						body,
					},
				});
			}
		} catch (error) {
			console.error(`   ❌ Error: ${error.message}`);
			res.status(500).json(generateErrorResponse(500, error.message));
		}
	};
}

/**
 * Generate Express routes from OpenAPI spec
 * @param {object} openApiSpec - OpenAPI specification
 * @param {object} options - Options (io for socket, socketTriggers map)
 * @returns {express.Router} Express router with mock routes
 */
function generateRoutes(openApiSpec, options = {}) {
	const router = express.Router();

	if (!openApiSpec || !openApiSpec.paths) {
		console.warn("⚠️  No paths found in OpenAPI spec");
		return router;
	}

	let routeCount = 0;

	// Iterate over all paths
	for (const [path, pathItem] of Object.entries(openApiSpec.paths)) {
		const expressPath = convertPath(path);

		// Iterate over HTTP methods
		for (const method of HTTP_METHODS) {
			const operation = pathItem[method];

			if (!operation) continue;

			// Create auth middleware for this operation
			const authMiddleware = createAuthMiddleware(operation);

			// Create route handler
			const handler = buildRouteHandler(method, path, operation, openApiSpec, options);

			// Register route
			router[method](expressPath, authMiddleware, handler);
			routeCount++;

			const operationId = operation.operationId || `${method.toUpperCase()} ${path}`;
			console.log(`   📍 ${method.toUpperCase()} ${expressPath} (${operationId})`);
		}
	}

	console.log(`✅ Generated ${routeCount} mock routes`);

	return router;
}

/**
 * Get route statistics from OpenAPI spec
 * @param {object} openApiSpec - OpenAPI specification
 * @returns {object} Statistics object
 */
function getRouteStats(openApiSpec) {
	if (!openApiSpec || !openApiSpec.paths) {
		return { total: 0, byMethod: {} };
	}

	const stats = {
		total: 0,
		byMethod: {},
		paths: [],
	};

	for (const [path, pathItem] of Object.entries(openApiSpec.paths)) {
		for (const method of HTTP_METHODS) {
			if (pathItem[method]) {
				stats.total++;
				stats.byMethod[method] = (stats.byMethod[method] || 0) + 1;
				stats.paths.push({
					method: method.toUpperCase(),
					path,
					operationId: pathItem[method].operationId,
				});
			}
		}
	}

	return stats;
}

module.exports = {
	generateRoutes,
	convertPath,
	getResponseSchema,
	getSuccessStatus,
	buildRouteHandler,
	getRouteStats,
};
