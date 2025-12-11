#!/usr/bin/env node

/**
 * GxP API Specs MCP Server
 *
 * Provides API documentation (OpenAPI, AsyncAPI, Webhooks) to AI coding assistants
 * via the Model Context Protocol (MCP).
 *
 * Features:
 * - Fetches specs based on VITE_API_ENV environment variable
 * - Caches specs in memory for performance
 * - Provides tools for fetching full specs or searching endpoints
 *
 * Usage:
 *   node mcp/gxp-api-server.js
 *
 * Configure in your AI tool's MCP settings to enable API-aware assistance.
 */

const readline = require("readline");
const fs = require("fs");
const path = require("path");

// Environment URL configuration (matches constants.js)
const ENVIRONMENT_URLS = {
	production: {
		apiBaseUrl: "https://api.gramercy.cloud",
		openApiSpec: "https://api.gramercy.cloud/api-specs/openapi.json",
		asyncApiSpec: "https://api.gramercy.cloud/api-specs/asyncapi.json",
		webhookSpec: "https://api.gramercy.cloud/api-specs/webhooks.json",
	},
	staging: {
		apiBaseUrl: "https://api.efz-staging.env.eventfinity.app",
		openApiSpec:
			"https://api.efz-staging.env.eventfinity.app/api-specs/openapi.json",
		asyncApiSpec:
			"https://api.efz-staging.env.eventfinity.app/api-specs/asyncapi.json",
		webhookSpec:
			"https://api.efz-staging.env.eventfinity.app/api-specs/webhooks.json",
	},
	testing: {
		apiBaseUrl: "https://api.zenith-develop-testing.env.eventfinity.app",
		openApiSpec:
			"https://api.zenith-develop-testing.env.eventfinity.app/api-specs/openapi.json",
		asyncApiSpec:
			"https://api.zenith-develop-testing.env.eventfinity.app/api-specs/asyncapi.json",
		webhookSpec:
			"https://api.zenith-develop-testing.env.eventfinity.app/api-specs/webhooks.json",
	},
	develop: {
		apiBaseUrl: "https://api.zenith-develop.env.eventfinity.app",
		openApiSpec:
			"https://api.zenith-develop.env.eventfinity.app/api-specs/openapi.json",
		asyncApiSpec:
			"https://api.zenith-develop.env.eventfinity.app/api-specs/asyncapi.json",
		webhookSpec:
			"https://api.zenith-develop.env.eventfinity.app/api-specs/webhooks.json",
	},
	local: {
		apiBaseUrl: "https://dashboard.eventfinity.test",
		openApiSpec: "https://api.eventfinity.test/api-specs/openapi.json",
		asyncApiSpec: "https://api.eventfinity.test/api-specs/asyncapi.json",
		webhookSpec: "https://api.eventfinity.test/api-specs/webhooks.json",
	},
};

// Cache for fetched specs
const specCache = {
	openapi: null,
	asyncapi: null,
	webhooks: null,
	lastFetch: null,
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get current environment from .env file or default
 */
function getEnvironment() {
	// Try to read from .env file in current directory
	const envPath = path.join(process.cwd(), ".env");
	if (fs.existsSync(envPath)) {
		const envContent = fs.readFileSync(envPath, "utf-8");
		const match = envContent.match(/VITE_API_ENV=(\w+)/);
		if (match) {
			return match[1];
		}
	}

	// Fall back to environment variable or default
	return process.env.VITE_API_ENV || process.env.API_ENV || "develop";
}

/**
 * Get URLs for current environment
 */
function getEnvUrls() {
	const env = getEnvironment();
	return ENVIRONMENT_URLS[env] || ENVIRONMENT_URLS.develop;
}

/**
 * Fetch a spec with caching
 */
async function fetchSpec(specType) {
	const urls = getEnvUrls();
	const urlMap = {
		openapi: urls.openApiSpec,
		asyncapi: urls.asyncApiSpec,
		webhooks: urls.webhookSpec,
	};

	const url = urlMap[specType];
	if (!url) {
		throw new Error(`Unknown spec type: ${specType}`);
	}

	// Check cache
	const now = Date.now();
	if (
		specCache[specType] &&
		specCache.lastFetch &&
		now - specCache.lastFetch < CACHE_TTL
	) {
		return specCache[specType];
	}

	// Fetch fresh
	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}
		const data = await response.json();
		specCache[specType] = data;
		specCache.lastFetch = now;
		return data;
	} catch (error) {
		throw new Error(`Failed to fetch ${specType} spec from ${url}: ${error.message}`);
	}
}

/**
 * Search OpenAPI spec for endpoints matching a query
 */
function searchEndpoints(spec, query) {
	const results = [];
	const queryLower = query.toLowerCase();

	if (spec.paths) {
		for (const [path, methods] of Object.entries(spec.paths)) {
			for (const [method, details] of Object.entries(methods)) {
				if (
					typeof details === "object" &&
					(path.toLowerCase().includes(queryLower) ||
						details.summary?.toLowerCase().includes(queryLower) ||
						details.description?.toLowerCase().includes(queryLower) ||
						details.operationId?.toLowerCase().includes(queryLower) ||
						details.tags?.some((t) => t.toLowerCase().includes(queryLower)))
				) {
					results.push({
						path,
						method: method.toUpperCase(),
						summary: details.summary || "",
						description: details.description || "",
						operationId: details.operationId || "",
						tags: details.tags || [],
						parameters: details.parameters || [],
						requestBody: details.requestBody || null,
						responses: Object.keys(details.responses || {}),
					});
				}
			}
		}
	}

	return results;
}

/**
 * Search AsyncAPI spec for channels/events matching a query
 */
function searchEvents(spec, query) {
	const results = [];
	const queryLower = query.toLowerCase();

	if (spec.channels) {
		for (const [channel, details] of Object.entries(spec.channels)) {
			if (
				channel.toLowerCase().includes(queryLower) ||
				details.description?.toLowerCase().includes(queryLower)
			) {
				const operations = [];
				if (details.publish) {
					operations.push({
						type: "publish",
						summary: details.publish.summary || "",
						message: details.publish.message || null,
					});
				}
				if (details.subscribe) {
					operations.push({
						type: "subscribe",
						summary: details.subscribe.summary || "",
						message: details.subscribe.message || null,
					});
				}

				results.push({
					channel,
					description: details.description || "",
					operations,
				});
			}
		}
	}

	return results;
}

/**
 * Get endpoint details by path and method
 */
function getEndpointDetails(spec, path, method) {
	const methodLower = method.toLowerCase();
	const endpoint = spec.paths?.[path]?.[methodLower];

	if (!endpoint) {
		return null;
	}

	return {
		path,
		method: method.toUpperCase(),
		summary: endpoint.summary || "",
		description: endpoint.description || "",
		operationId: endpoint.operationId || "",
		tags: endpoint.tags || [],
		parameters: endpoint.parameters || [],
		requestBody: endpoint.requestBody || null,
		responses: endpoint.responses || {},
		security: endpoint.security || spec.security || [],
	};
}

// MCP Server Implementation
const SERVER_INFO = {
	name: "gxp-api-server",
	version: "1.0.0",
	description: "GxP API documentation server for AI coding assistants",
};

const TOOLS = [
	{
		name: "get_openapi_spec",
		description:
			"Fetch the full OpenAPI specification for the GxP API. Returns the complete spec including all endpoints, schemas, and documentation.",
		inputSchema: {
			type: "object",
			properties: {},
			required: [],
		},
	},
	{
		name: "get_asyncapi_spec",
		description:
			"Fetch the AsyncAPI specification for GxP WebSocket events. Returns channel definitions, message schemas, and event documentation.",
		inputSchema: {
			type: "object",
			properties: {},
			required: [],
		},
	},
	{
		name: "search_api_endpoints",
		description:
			"Search for API endpoints matching a query. Searches path, summary, description, operation ID, and tags.",
		inputSchema: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description:
						"Search term to find matching endpoints (e.g., 'attendee', 'check-in', 'event')",
				},
			},
			required: ["query"],
		},
	},
	{
		name: "search_websocket_events",
		description:
			"Search for WebSocket channels/events matching a query. Searches channel names and descriptions.",
		inputSchema: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description:
						"Search term to find matching events (e.g., 'message', 'created', 'updated')",
				},
			},
			required: ["query"],
		},
	},
	{
		name: "get_endpoint_details",
		description:
			"Get detailed information about a specific API endpoint including parameters, request body, and responses.",
		inputSchema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "API endpoint path (e.g., '/api/v1/attendees')",
				},
				method: {
					type: "string",
					description: "HTTP method (GET, POST, PUT, PATCH, DELETE)",
				},
			},
			required: ["path", "method"],
		},
	},
	{
		name: "get_api_environment",
		description:
			"Get the current API environment configuration including base URL and spec URLs.",
		inputSchema: {
			type: "object",
			properties: {},
			required: [],
		},
	},
];

/**
 * Handle MCP tool calls
 */
async function handleToolCall(name, args) {
	switch (name) {
		case "get_openapi_spec": {
			const spec = await fetchSpec("openapi");
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(spec, null, 2),
					},
				],
			};
		}

		case "get_asyncapi_spec": {
			const spec = await fetchSpec("asyncapi");
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(spec, null, 2),
					},
				],
			};
		}

		case "search_api_endpoints": {
			const spec = await fetchSpec("openapi");
			const results = searchEndpoints(spec, args.query);
			return {
				content: [
					{
						type: "text",
						text:
							results.length > 0
								? JSON.stringify(results, null, 2)
								: `No endpoints found matching "${args.query}"`,
					},
				],
			};
		}

		case "search_websocket_events": {
			const spec = await fetchSpec("asyncapi");
			const results = searchEvents(spec, args.query);
			return {
				content: [
					{
						type: "text",
						text:
							results.length > 0
								? JSON.stringify(results, null, 2)
								: `No events found matching "${args.query}"`,
					},
				],
			};
		}

		case "get_endpoint_details": {
			const spec = await fetchSpec("openapi");
			const details = getEndpointDetails(spec, args.path, args.method);
			return {
				content: [
					{
						type: "text",
						text: details
							? JSON.stringify(details, null, 2)
							: `Endpoint not found: ${args.method} ${args.path}`,
					},
				],
			};
		}

		case "get_api_environment": {
			const env = getEnvironment();
			const urls = getEnvUrls();
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								environment: env,
								...urls,
							},
							null,
							2
						),
					},
				],
			};
		}

		default:
			throw new Error(`Unknown tool: ${name}`);
	}
}

/**
 * Process MCP JSON-RPC request
 */
async function processRequest(request) {
	const { method, params, id } = request;

	try {
		let result;

		switch (method) {
			case "initialize":
				result = {
					protocolVersion: "2024-11-05",
					capabilities: {
						tools: {},
					},
					serverInfo: SERVER_INFO,
				};
				break;

			case "tools/list":
				result = { tools: TOOLS };
				break;

			case "tools/call":
				result = await handleToolCall(params.name, params.arguments || {});
				break;

			case "notifications/initialized":
				// No response needed for notifications
				return null;

			default:
				throw new Error(`Unknown method: ${method}`);
		}

		return { jsonrpc: "2.0", id, result };
	} catch (error) {
		return {
			jsonrpc: "2.0",
			id,
			error: {
				code: -32603,
				message: error.message,
			},
		};
	}
}

/**
 * Main server loop
 */
async function main() {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: false,
	});

	for await (const line of rl) {
		if (!line.trim()) continue;

		try {
			const request = JSON.parse(line);
			const response = await processRequest(request);

			if (response) {
				console.log(JSON.stringify(response));
			}
		} catch (error) {
			console.log(
				JSON.stringify({
					jsonrpc: "2.0",
					id: null,
					error: {
						code: -32700,
						message: `Parse error: ${error.message}`,
					},
				})
			);
		}
	}
}

// Run server
main().catch(console.error);
