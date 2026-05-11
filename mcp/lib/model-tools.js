/**
 * MCP tools for OpenAPI data-model introspection.
 *
 *   - describe_data_models : enumerate or detail OpenAPI components.schemas.
 *     With no args, returns every schema name + description + required +
 *     property summary. Pass `name` for a single exact-match model, or
 *     `query` for a substring filter on name + description.
 *
 * Schema property summaries resolve $ref one level deep (showing the
 * referenced model name as the type) and walk allOf compositions so the
 * caller sees inherited fields in one place.
 */

const { fetchSpec } = require("./specs")

function contentResult(obj) {
	return {
		content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
	}
}

function resolveRef(spec, ref) {
	if (!ref || typeof ref !== "string" || !ref.startsWith("#/")) return null
	const segs = ref.slice(2).split("/")
	let cur = spec
	for (const s of segs) {
		if (!cur || typeof cur !== "object") return null
		cur = cur[s]
	}
	return cur || null
}

function refName(ref) {
	if (!ref || typeof ref !== "string") return null
	return ref.split("/").pop()
}

function summarizeProperty(prop, spec) {
	if (!prop || typeof prop !== "object") {
		return { type: "unknown" }
	}
	if (prop.$ref) {
		return {
			type: refName(prop.$ref) || "ref",
			description: prop.description || undefined,
		}
	}
	const out = {
		type:
			prop.type ||
			(prop.oneOf
				? "oneOf"
				: prop.anyOf
					? "anyOf"
					: prop.allOf
						? "allOf"
						: "unknown"),
		description: prop.description || undefined,
		format: prop.format || undefined,
		enum: prop.enum || undefined,
		nullable: prop.nullable || undefined,
	}
	if (prop.type === "array" && prop.items) {
		out.items = prop.items.$ref
			? refName(prop.items.$ref)
			: prop.items.type || "unknown"
	}
	for (const k of Object.keys(out)) {
		if (out[k] === undefined) delete out[k]
	}
	return out
}

function summarizeProperties(schema, spec, seen = new Set()) {
	if (!schema || typeof schema !== "object") return null
	let target = schema
	if (target.$ref) {
		if (seen.has(target.$ref)) return null
		seen.add(target.$ref)
		target = resolveRef(spec, target.$ref) || target
	}
	const out = {}
	if (Array.isArray(target.allOf)) {
		for (const piece of target.allOf) {
			const sub = summarizeProperties(piece, spec, seen)
			if (sub) Object.assign(out, sub)
		}
	}
	if (target.properties && typeof target.properties === "object") {
		for (const [name, prop] of Object.entries(target.properties)) {
			out[name] = summarizeProperty(prop, spec)
		}
	}
	return Object.keys(out).length > 0 ? out : null
}

async function describeDataModels({ name, query } = {}) {
	const spec = await fetchSpec("openapi")
	const schemas = (spec && spec.components && spec.components.schemas) || {}
	const entries = Object.entries(schemas)

	if (name) {
		const hit = entries.find(([n]) => n === name)
		if (!hit) {
			return {
				ok: false,
				error: `Model not found: ${name}`,
				available_sample: entries.map(([n]) => n).slice(0, 50),
				available_count: entries.length,
			}
		}
		const [hitName, hitSchema] = hit
		return {
			ok: true,
			count: 1,
			models: [
				{
					name: hitName,
					description: hitSchema.description || "",
					type: hitSchema.type || (hitSchema.$ref ? "ref" : "object"),
					required: hitSchema.required || [],
					properties: summarizeProperties(hitSchema, spec) || {},
				},
			],
		}
	}

	let filtered = entries
	if (query) {
		const q = String(query).toLowerCase()
		filtered = entries.filter(([n, s]) => {
			if (n.toLowerCase().includes(q)) return true
			const desc = (s && s.description) || ""
			return desc.toLowerCase().includes(q)
		})
	}

	const models = filtered.map(([n, s]) => ({
		name: n,
		description: s.description || "",
		type: s.type || (s.$ref ? "ref" : "object"),
		required: s.required || [],
		properties: summarizeProperties(s, spec) || {},
	}))

	return { ok: true, count: models.length, models }
}

const MODEL_TOOLS = [
	{
		name: "describe_data_models",
		description:
			"Enumerate or detail OpenAPI data models from components.schemas. With no args, returns every schema with a property summary. Pass `name` for one exact-match model, or `query` for a case-insensitive substring filter across model name + description. Property summaries walk allOf and resolve $ref by name so referenced models are visible without a second call.",
		inputSchema: {
			type: "object",
			properties: {
				name: {
					type: "string",
					description:
						"Exact model name (e.g. 'Attendee'). Returns only that model.",
				},
				query: {
					type: "string",
					description:
						"Case-insensitive substring filter across model name + description.",
				},
			},
		},
	},
]

async function handleModelToolCall(name, args = {}) {
	switch (name) {
		case "describe_data_models":
			return contentResult(await describeDataModels(args))
		default:
			throw new Error(`Unknown model tool: ${name}`)
	}
}

function isModelTool(name) {
	return MODEL_TOOLS.some((t) => t.name === name)
}

module.exports = {
	MODEL_TOOLS,
	handleModelToolCall,
	isModelTool,
	describeDataModels,
	summarizeProperties,
	resolveRef,
}
