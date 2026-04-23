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

const readline = require("readline")
const {
	ENVIRONMENT_URLS,
	getEnvironment,
	getEnvUrls,
	fetchSpec,
} = require("./lib/specs")

/**
 * Search OpenAPI spec for endpoints matching a query
 */
function searchEndpoints(spec, query) {
	const results = []
	const queryLower = query.toLowerCase()

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
					})
				}
			}
		}
	}

	return results
}

/**
 * Search AsyncAPI spec for channels/events matching a query.
 *
 * Matches across:
 *   - components.messages (event name, summary, description, x-triggered-by)
 *   - channels            (channel name, description)
 *
 * For messages, the returned `eventName` is what you pass to
 * store.listen(eventName, permissionIdentifier, callback) on the client.
 */
function searchEvents(spec, query) {
	const results = []
	const queryLower = query.toLowerCase()

	const messages = spec?.components?.messages || {}
	for (const [eventName, message] of Object.entries(messages)) {
		if (typeof message !== "object" || message === null) continue
		const trigger = message["x-triggered-by"] || ""
		if (
			eventName.toLowerCase().includes(queryLower) ||
			message.summary?.toLowerCase().includes(queryLower) ||
			message.description?.toLowerCase().includes(queryLower) ||
			trigger.toLowerCase().includes(queryLower)
		) {
			results.push({
				kind: "event",
				eventName,
				summary: message.summary || "",
				description: message.description || "",
				triggeredBy: trigger || null,
				payloadRef: message.payload?.$ref || null,
			})
		}
	}

	if (spec.channels) {
		for (const [channel, details] of Object.entries(spec.channels)) {
			if (
				channel.toLowerCase().includes(queryLower) ||
				details.description?.toLowerCase().includes(queryLower)
			) {
				const operations = []
				if (details.publish) {
					operations.push({
						type: "publish",
						summary: details.publish.summary || "",
						message: details.publish.message || null,
					})
				}
				if (details.subscribe) {
					operations.push({
						type: "subscribe",
						summary: details.subscribe.summary || "",
						message: details.subscribe.message || null,
					})
				}

				results.push({
					kind: "channel",
					channel,
					description: details.description || "",
					operations,
				})
			}
		}
	}

	return results
}

/**
 * Get endpoint details by path and method
 */
function getEndpointDetails(spec, path, method) {
	const methodLower = method.toLowerCase()
	const endpoint = spec.paths?.[path]?.[methodLower]

	if (!endpoint) {
		return null
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
	}
}

// MCP Server Implementation
const {
	CONFIG_TOOLS,
	handleConfigToolCall,
	isConfigTool,
} = require("./lib/config-tools")

const {
	EXT_API_TOOLS,
	handleExtApiToolCall,
	isExtApiTool,
} = require("./lib/api-tools")

const {
	DOCS_TOOLS,
	handleDocsToolCall,
	isDocsTool,
} = require("./lib/docs-tools")

const {
	TEST_TOOLS,
	handleTestToolCall,
	isTestTool,
} = require("./lib/test-tools")

const SERVER_INFO = {
	name: "gxp-api-server",
	version: "2.0.0",
	description:
		"GxP toolkit MCP server: API specs, config/manifest editing, documentation search, and plugin test helpers for AI coding assistants.",
}

const API_TOOLS = [
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
			"Search AsyncAPI events matching a query. Searches components.messages (event name, summary, description, x-triggered-by) and channel definitions. The returned eventName is what you pass to store.listen(eventName, permissionIdentifier, callback).",
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
]

// Final tool set surfaced to MCP clients: API spec tools + extended API tools
// + config-editor tools + doc-search tools + test tools.
const TOOLS = [
	...API_TOOLS,
	...EXT_API_TOOLS,
	...CONFIG_TOOLS,
	...DOCS_TOOLS,
	...TEST_TOOLS,
]

/**
 * Handle MCP tool calls
 */
async function handleToolCall(name, args) {
	if (isConfigTool(name)) {
		return handleConfigToolCall(name, args)
	}
	if (isExtApiTool(name)) {
		return handleExtApiToolCall(name, args)
	}
	if (isDocsTool(name)) {
		return handleDocsToolCall(name, args)
	}
	if (isTestTool(name)) {
		return handleTestToolCall(name, args)
	}
	switch (name) {
		case "get_openapi_spec": {
			const spec = await fetchSpec("openapi")
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(spec, null, 2),
					},
				],
			}
		}

		case "get_asyncapi_spec": {
			const spec = await fetchSpec("asyncapi")
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(spec, null, 2),
					},
				],
			}
		}

		case "search_api_endpoints": {
			const spec = await fetchSpec("openapi")
			const results = searchEndpoints(spec, args.query)
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
			}
		}

		case "search_websocket_events": {
			const spec = await fetchSpec("asyncapi")
			const results = searchEvents(spec, args.query)
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
			}
		}

		case "get_endpoint_details": {
			const spec = await fetchSpec("openapi")
			const details = getEndpointDetails(spec, args.path, args.method)
			return {
				content: [
					{
						type: "text",
						text: details
							? JSON.stringify(details, null, 2)
							: `Endpoint not found: ${args.method} ${args.path}`,
					},
				],
			}
		}

		case "get_api_environment": {
			const env = getEnvironment()
			const urls = getEnvUrls()
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
							2,
						),
					},
				],
			}
		}

		default:
			throw new Error(`Unknown tool: ${name}`)
	}
}

/**
 * Process MCP JSON-RPC request
 */
async function processRequest(request) {
	const { method, params, id } = request

	try {
		let result

		switch (method) {
			case "initialize":
				result = {
					protocolVersion: "2024-11-05",
					capabilities: {
						tools: {},
					},
					serverInfo: SERVER_INFO,
				}
				break

			case "tools/list":
				result = { tools: TOOLS }
				break

			case "tools/call":
				result = await handleToolCall(params.name, params.arguments || {})
				break

			case "notifications/initialized":
				// No response needed for notifications
				return null

			default:
				throw new Error(`Unknown method: ${method}`)
		}

		return { jsonrpc: "2.0", id, result }
	} catch (error) {
		return {
			jsonrpc: "2.0",
			id,
			error: {
				code: -32603,
				message: error.message,
			},
		}
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
	})

	for await (const line of rl) {
		if (!line.trim()) continue

		try {
			const request = JSON.parse(line)
			const response = await processRequest(request)

			if (response) {
				console.log(JSON.stringify(response))
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
				}),
			)
		}
	}
}

// Run server
main().catch(console.error)
