/**
 * Extended MCP API tools (Phase 3).
 *
 * Builds on the existing search_api_endpoints / get_endpoint_details to add:
 *   - api_list_tags              : enumerate all OpenAPI tags
 *   - api_list_operation_ids     : enumerate operations, optionally filtered by tag
 *   - api_get_operation_parameters : deep detail for a single operation id
 *   - api_find_endpoints_by_schema : search by request/response field names
 *   - api_generate_dependency    : build the GxP dependency JSON from a
 *                                   tag + selected operations/events,
 *                                   optionally appending to app-manifest.json
 *
 * The dependency shape mirrors bin/lib/commands/add-dependency.js:
 *   { identifier, model, permissionKey, permissions: [], operations: {}, events: {} }
 */

const fs = require("fs")
const path = require("path")
const { fetchSpec } = require("./specs")

/* ---------------------------------- utils --------------------------------- */

function contentResult(obj) {
	return {
		content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
	}
}

function walkOperations(spec) {
	const out = []
	if (!spec || !spec.paths) return out
	for (const [p, methods] of Object.entries(spec.paths)) {
		for (const [method, op] of Object.entries(methods)) {
			if (typeof op !== "object" || op === null) continue
			if (
				!["get", "post", "put", "patch", "delete", "options", "head"].includes(
					method,
				)
			) {
				continue
			}
			out.push({ path: p, method: method.toUpperCase(), op })
		}
	}
	return out
}

/**
 * Return the list of distinct field names mentioned anywhere in a JSON-ish
 * object, walking $ref via the components registry shallowly.
 */
function schemaFieldNames(schema, components, depth = 0, seen = new Set()) {
	if (!schema || depth > 4) return []
	if (schema.$ref && components) {
		const refName = schema.$ref.split("/").pop()
		if (seen.has(refName)) return []
		seen.add(refName)
		const target = components?.schemas?.[refName]
		return schemaFieldNames(target, components, depth + 1, seen)
	}
	const names = []
	if (schema.properties && typeof schema.properties === "object") {
		for (const [name, subSchema] of Object.entries(schema.properties)) {
			names.push(name)
			names.push(...schemaFieldNames(subSchema, components, depth + 1, seen))
		}
	}
	if (schema.items) {
		names.push(...schemaFieldNames(schema.items, components, depth + 1, seen))
	}
	if (Array.isArray(schema.allOf)) {
		for (const sub of schema.allOf) {
			names.push(...schemaFieldNames(sub, components, depth + 1, seen))
		}
	}
	return names
}

function findOperationById(spec, operationId) {
	for (const { path: p, method, op } of walkOperations(spec)) {
		if (op.operationId === operationId) {
			return { path: p, method, op }
		}
	}
	return null
}

/* ------------------------------ tool schemas ------------------------------ */

const EXT_API_TOOLS = [
	{
		name: "api_list_tags",
		description:
			"List every tag in the OpenAPI spec with endpoint counts. Use this to discover platform 'models' (attendees, projects, events, etc.) before building a dependency.",
		inputSchema: { type: "object", properties: {}, required: [] },
	},
	{
		name: "api_list_operation_ids",
		description:
			"Enumerate operation IDs in the OpenAPI spec. Optionally filter by tag.",
		inputSchema: {
			type: "object",
			properties: {
				tag: {
					type: "string",
					description:
						"Filter to operations under this tag (e.g. 'Attendees'). Omit for all.",
				},
			},
			required: [],
		},
	},
	{
		name: "api_get_operation_parameters",
		description:
			"Look up a single operation by id and return its path, method, parameters, requestBody schema, response schemas, and required permissions.",
		inputSchema: {
			type: "object",
			properties: {
				operationId: {
					type: "string",
					description: "OpenAPI operationId (e.g. 'attendees.index').",
				},
			},
			required: ["operationId"],
		},
	},
	{
		name: "api_find_endpoints_by_schema",
		description:
			"Search endpoints by structural hints: field names present in the request or response bodies, URL path substrings, or HTTP method. Combine any filters — all are AND'd.",
		inputSchema: {
			type: "object",
			properties: {
				request_field: {
					type: "string",
					description:
						"Find endpoints whose request body schema mentions this field name.",
				},
				response_field: {
					type: "string",
					description:
						"Find endpoints whose response schema mentions this field name.",
				},
				path_pattern: {
					type: "string",
					description: "Substring that must appear in the path.",
				},
				method: {
					type: "string",
					description: "HTTP method filter (GET, POST, etc.).",
				},
				tag: {
					type: "string",
					description: "Restrict to one tag.",
				},
			},
			required: [],
		},
	},
	{
		name: "api_generate_dependency",
		description:
			"Build the GxP dependency JSON (for app-manifest.json dependencies[]) from a tag and an explicit list of operationIds and/or asyncapi event names. Optionally append it to an app-manifest.json file.",
		inputSchema: {
			type: "object",
			properties: {
				identifier: {
					type: "string",
					description:
						"Short slug used by plugin code to reference the dependency (e.g. 'attendees').",
				},
				tag: {
					type: "string",
					description: "OpenAPI tag name — becomes the dependency's 'model'.",
				},
				operationIds: {
					type: "array",
					items: { type: "string" },
					description:
						"Operation IDs to include. Omit to include every operation under the tag.",
				},
				eventNames: {
					type: "array",
					items: { type: "string" },
					description:
						"AsyncAPI event names to wire up in the dependency's events map.",
				},
				writeTo: {
					type: "string",
					description:
						"Optional path to an app-manifest.json. When provided, the dependency is appended/replaced in manifest.dependencies[] and the file is rewritten.",
				},
			},
			required: ["identifier", "tag"],
		},
	},
]

/* ---------------------------------- core ---------------------------------- */

async function listTags() {
	const spec = await fetchSpec("openapi")
	const tagMeta = new Map()
	for (const t of spec.tags || []) {
		tagMeta.set(t.name, {
			name: t.name,
			description: t.description || "",
			pathCount: 0,
		})
	}
	for (const { op } of walkOperations(spec)) {
		for (const tag of op.tags || []) {
			if (!tagMeta.has(tag)) {
				tagMeta.set(tag, { name: tag, description: "", pathCount: 0 })
			}
			tagMeta.get(tag).pathCount++
		}
	}
	return Array.from(tagMeta.values()).sort((a, b) =>
		a.name.localeCompare(b.name),
	)
}

async function listOperationIds(tag) {
	const spec = await fetchSpec("openapi")
	const out = []
	for (const { path: p, method, op } of walkOperations(spec)) {
		if (!op.operationId) continue
		if (tag && !(op.tags || []).includes(tag)) continue
		out.push({
			operationId: op.operationId,
			method,
			path: p,
			tags: op.tags || [],
			summary: op.summary || "",
		})
	}
	return out
}

async function getOperationParameters(operationId) {
	const spec = await fetchSpec("openapi")
	const found = findOperationById(spec, operationId)
	if (!found) return null

	const { path: p, method, op } = found
	const permission =
		op["x-permission"] ||
		op["x-permissionKey"] ||
		op.security?.[0]?.permission ||
		null

	return {
		operationId,
		path: p,
		method,
		tags: op.tags || [],
		summary: op.summary || "",
		description: op.description || "",
		parameters: op.parameters || [],
		requestBody: op.requestBody || null,
		responses: op.responses || {},
		permission,
		security: op.security || spec.security || [],
	}
}

async function findEndpointsBySchema(filters) {
	const spec = await fetchSpec("openapi")
	const components = spec.components || {}
	const {
		request_field: reqField,
		response_field: respField,
		path_pattern: pathPattern,
		method: methodFilter,
		tag,
	} = filters || {}

	const out = []
	for (const { path: p, method, op } of walkOperations(spec)) {
		if (methodFilter && methodFilter.toUpperCase() !== method) continue
		if (pathPattern && !p.includes(pathPattern)) continue
		if (tag && !(op.tags || []).includes(tag)) continue

		if (reqField) {
			const reqSchema = op.requestBody?.content?.["application/json"]?.schema
			const fields = schemaFieldNames(reqSchema, components)
			if (!fields.includes(reqField)) continue
		}
		if (respField) {
			// Prefer a 2xx response; fall back to any.
			const responses = op.responses || {}
			const preferred =
				responses["200"] ||
				responses["201"] ||
				responses["204"] ||
				Object.values(responses)[0]
			const respSchema = preferred?.content?.["application/json"]?.schema
			const fields = schemaFieldNames(respSchema, components)
			if (!fields.includes(respField)) continue
		}

		out.push({
			operationId: op.operationId || null,
			method,
			path: p,
			tags: op.tags || [],
			summary: op.summary || "",
		})
	}
	return out
}

async function generateDependency({
	identifier,
	tag,
	operationIds,
	eventNames,
	writeTo,
}) {
	const openapi = await fetchSpec("openapi")

	// Discover operations under the tag.
	const scoped = []
	for (const { path: p, method, op } of walkOperations(openapi)) {
		if (!(op.tags || []).includes(tag)) continue
		if (operationIds && operationIds.length > 0) {
			if (!operationIds.includes(op.operationId)) continue
		}
		scoped.push({ path: p, method, op })
	}

	if (scoped.length === 0) {
		return {
			ok: false,
			error: `No operations found for tag="${tag}"${
				operationIds
					? ` matching operationIds=${JSON.stringify(operationIds)}`
					: ""
			}.`,
		}
	}

	const operations = {}
	const permissions = new Set()
	let permissionKey = null
	for (const { path: p, method, op } of scoped) {
		if (!op.operationId) continue
		const cleanOpId = op.operationId.replace(/^portal\.v1\.project\./, "")
		operations[cleanOpId] = `${method.toLowerCase()}:${p}`

		const perm = op["x-permission"] || op.security?.[0]?.permission || null
		if (perm) permissions.add(perm)

		const key = op["x-permission-key"] || op["x-permissionKey"] || null
		if (!permissionKey && key) permissionKey = key
	}

	const events = {}
	if (Array.isArray(eventNames)) {
		for (const name of eventNames) {
			events[name] = name
		}
	}

	const dependency = {
		identifier,
		model: tag,
		permissionKey,
		permissions: Array.from(permissions).sort(),
		operations,
		events,
	}

	const result = { ok: true, dependency, wrote: false }

	if (writeTo) {
		const absPath = path.resolve(process.cwd(), writeTo)
		let manifest = { dependencies: [] }
		if (fs.existsSync(absPath)) {
			manifest = JSON.parse(fs.readFileSync(absPath, "utf-8"))
		}
		if (!Array.isArray(manifest.dependencies)) {
			manifest.dependencies = []
		}
		const existingIdx = manifest.dependencies.findIndex(
			(d) => d.identifier === identifier,
		)
		if (existingIdx >= 0) {
			manifest.dependencies[existingIdx] = dependency
			result.replaced = true
		} else {
			manifest.dependencies.push(dependency)
			result.replaced = false
		}
		fs.writeFileSync(absPath, JSON.stringify(manifest, null, "\t"))
		result.wrote = true
		result.file = absPath
	}

	return result
}

/* --------------------------------- dispatch ------------------------------- */

async function handleExtApiToolCall(name, args = {}) {
	switch (name) {
		case "api_list_tags":
			return contentResult({ tags: await listTags() })

		case "api_list_operation_ids":
			return contentResult({
				operations: await listOperationIds(args.tag),
			})

		case "api_get_operation_parameters": {
			const detail = await getOperationParameters(args.operationId)
			if (!detail) {
				return contentResult({
					error: `Operation not found: ${args.operationId}`,
				})
			}
			return contentResult(detail)
		}

		case "api_find_endpoints_by_schema":
			return contentResult({
				results: await findEndpointsBySchema(args || {}),
			})

		case "api_generate_dependency":
			return contentResult(await generateDependency(args))

		default:
			throw new Error(`Unknown ext api tool: ${name}`)
	}
}

function isExtApiTool(name) {
	return EXT_API_TOOLS.some((t) => t.name === name)
}

module.exports = {
	EXT_API_TOOLS,
	handleExtApiToolCall,
	isExtApiTool,
	// Exported for testing
	walkOperations,
	schemaFieldNames,
	listTags,
	listOperationIds,
	getOperationParameters,
	findEndpointsBySchema,
	generateDependency,
}
