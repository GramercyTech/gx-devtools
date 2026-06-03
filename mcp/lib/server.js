/**
 * Shared MCP server runner.
 *
 * Used by both the primary `mcp-serve` bin and the deprecated
 * `gxp-api-server` shim. Wires the official @modelcontextprotocol/sdk
 * over StdioServerTransport. The SDK is ESM-only and this module is
 * CommonJS, so the SDK is loaded via dynamic import() inside startServer().
 *
 * The full tool surface lives here:
 *   - API spec tools     (openapi/asyncapi search, endpoint details, env)
 *   - Extended API tools (api-tools.js)
 *   - Config tools       (config-tools.js)
 *   - Docs tools         (docs-tools.js)
 *   - Test tools         (test-tools.js)
 *   - Model tools        (model-tools.js)
 *
 * AppUI component introspection has moved out of this server. @gxp-dev/app-ui
 * ships @storybook/addon-mcp; when developers run `gxdev storybook` app-ui's
 * Storybook exposes its own HTTP MCP server at http://localhost:6006/mcp,
 * registered as `gxp-app-ui-storybook` in the plugin project's mcp.json.
 */

const { fetchSpec, getEnvironment, getEnvUrls } = require("./specs")
const {
	CONFIG_TOOLS,
	handleConfigToolCall,
	isConfigTool,
} = require("./config-tools")
const {
	EXT_API_TOOLS,
	handleExtApiToolCall,
	isExtApiTool,
} = require("./api-tools")
const { DOCS_TOOLS, handleDocsToolCall, isDocsTool } = require("./docs-tools")
const { TEST_TOOLS, handleTestToolCall, isTestTool } = require("./test-tools")
const {
	MODEL_TOOLS,
	handleModelToolCall,
	isModelTool,
} = require("./model-tools")

const SERVER_INFO = {
	name: "gxp-mcp-serve",
	version: "2.1.0",
}

const SERVER_DESCRIPTION =
	"GxP toolkit MCP server: API specs, data models, store API reference, config/manifest editing, documentation search, and plugin test helpers for AI coding assistants. AppUI component/story tools are served by the AppUI's own Storybook MCP (gxdev storybook).\n\n" +
	"IMPORTANT context for plugin authors: GxP is a multi-tenant platform. The platform admin UI (not the plugin) owns all configuration of forms, quizzes, surveys, quiz builders, leaderboards, settings, strings, assets, and project metadata. Plugins do NOT define these — they consume them. At runtime the platform injects manifest data (settings, strings, assets, dependencies, permissions) and the logged-in user into the GxP store, and exposes platform-managed resources via the REST API documented in the OpenAPI spec. Plugins should access forms/quizzes/surveys and their admin-built questions exclusively through `store.callApi(operationId, identifier, data)` — for example `forms.show`, `forms.fields.index`, `forms.responses.store`, `quiz.state`, `quiz.questions`, `quiz.answer`, `quiz.leaderboard`, `survey.metrics`. Use the API spec tools (`search_api_endpoints`, `api_list_tags`, `get_endpoint_details`, `describe_data_models`) to discover the exact operationIds, parameters, and response schemas. The logged-in user is read via `store.user` / `store.getUser()` / `store.getUserName()` / `store.getUserEmail()` (null when logged out).\n\n" +
	"IMPORTANT — the GxP store source file does NOT exist in plugin projects. `src/stores/gxpPortalConfigStore.js` will not be found on disk. Call `describe_store_api` to get the complete store API reference instead of trying to read a file."

/* -------------------- API spec search helpers (in-file) ------------------- */

function searchEndpoints(spec, query) {
	const results = []
	const queryLower = String(query).toLowerCase()

	if (spec.paths) {
		for (const [p, methods] of Object.entries(spec.paths)) {
			for (const [method, details] of Object.entries(methods)) {
				if (
					typeof details === "object" &&
					(p.toLowerCase().includes(queryLower) ||
						details.summary?.toLowerCase().includes(queryLower) ||
						details.description?.toLowerCase().includes(queryLower) ||
						details.operationId?.toLowerCase().includes(queryLower) ||
						details.tags?.some((t) => t.toLowerCase().includes(queryLower)))
				) {
					results.push({
						path: p,
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

function searchEvents(spec, query) {
	const results = []
	const queryLower = String(query).toLowerCase()

	const messages = spec?.components?.messages || {}
	for (const [eventName, message] of Object.entries(messages)) {
		if (typeof message !== "object" || message === null) continue
		// `x-triggered-by` is usually a string operationId, but a spec may
		// declare an array (multiple triggers) or omit it entirely. Normalize
		// to a searchable string so a non-string value can't crash the search
		// (`trigger.toLowerCase is not a function`); keep the raw value for the
		// returned `triggeredBy`.
		const triggerRaw = message["x-triggered-by"] ?? null
		const triggerText = Array.isArray(triggerRaw)
			? triggerRaw.join(" ")
			: typeof triggerRaw === "string"
				? triggerRaw
				: ""
		if (
			eventName.toLowerCase().includes(queryLower) ||
			message.summary?.toLowerCase().includes(queryLower) ||
			message.description?.toLowerCase().includes(queryLower) ||
			triggerText.toLowerCase().includes(queryLower)
		) {
			results.push({
				kind: "event",
				eventName,
				summary: message.summary || "",
				description: message.description || "",
				triggeredBy: triggerRaw,
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

function getEndpointDetails(spec, p, method) {
	const methodLower = method.toLowerCase()
	const endpoint = spec.paths?.[p]?.[methodLower]

	if (!endpoint) {
		return null
	}

	return {
		path: p,
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

/* ------------------------------- tool schemas ----------------------------- */

const API_TOOLS = [
	{
		name: "get_openapi_spec",
		description:
			"Fetch the full OpenAPI specification for the GxP API. Returns the complete spec including all endpoints, schemas, and documentation.",
		inputSchema: { type: "object", properties: {}, required: [] },
	},
	{
		name: "get_asyncapi_spec",
		description:
			"Fetch the AsyncAPI specification for GxP WebSocket events. Returns channel definitions, message schemas, and event documentation.",
		inputSchema: { type: "object", properties: {}, required: [] },
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
		inputSchema: { type: "object", properties: {}, required: [] },
	},
]

const TOOLS = [
	...API_TOOLS,
	...EXT_API_TOOLS,
	...CONFIG_TOOLS,
	...DOCS_TOOLS,
	...TEST_TOOLS,
	...MODEL_TOOLS,
]

/* ------------------------------ tool dispatch ----------------------------- */

async function handleToolCall(name, args = {}) {
	if (isConfigTool(name)) return handleConfigToolCall(name, args)
	if (isExtApiTool(name)) return handleExtApiToolCall(name, args)
	if (isDocsTool(name)) return handleDocsToolCall(name, args)
	if (isTestTool(name)) return handleTestToolCall(name, args)
	if (isModelTool(name)) return handleModelToolCall(name, args)

	switch (name) {
		case "get_openapi_spec": {
			const spec = await fetchSpec("openapi")
			return {
				content: [{ type: "text", text: JSON.stringify(spec, null, 2) }],
			}
		}
		case "get_asyncapi_spec": {
			const spec = await fetchSpec("asyncapi")
			return {
				content: [{ type: "text", text: JSON.stringify(spec, null, 2) }],
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
						text: JSON.stringify({ environment: env, ...urls }, null, 2),
					},
				],
			}
		}
		default:
			throw new Error(`Unknown tool: ${name}`)
	}
}

/* ------------------------------- entry point ------------------------------ */

/**
 * Boot the MCP server over stdio. Loads the official SDK via dynamic import
 * because @modelcontextprotocol/sdk is ESM-only and this package is CJS.
 */
async function startServer() {
	const sdkServer = await import("@modelcontextprotocol/sdk/server/index.js")
	const sdkStdio = await import("@modelcontextprotocol/sdk/server/stdio.js")
	const sdkTypes = await import("@modelcontextprotocol/sdk/types.js")
	const { Server } = sdkServer
	const { StdioServerTransport } = sdkStdio
	const { ListToolsRequestSchema, CallToolRequestSchema } = sdkTypes

	const server = new Server(
		{ name: SERVER_INFO.name, version: SERVER_INFO.version },
		{
			capabilities: { tools: {} },
			instructions: SERVER_DESCRIPTION,
		},
	)

	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: TOOLS,
	}))

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: args } = request.params
		try {
			return await handleToolCall(name, args || {})
		} catch (err) {
			return {
				isError: true,
				content: [
					{
						type: "text",
						text: `Error: ${err && err.message ? err.message : String(err)}`,
					},
				],
			}
		}
	})

	const transport = new StdioServerTransport()
	await server.connect(transport)
}

module.exports = {
	startServer,
	TOOLS,
	API_TOOLS,
	SERVER_INFO,
	SERVER_DESCRIPTION,
	handleToolCall,
	searchEndpoints,
	searchEvents,
	getEndpointDetails,
}
