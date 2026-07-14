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

const STORE_API_REFERENCE = `# GxP Store API Reference

The GxP store (\`gxpPortalConfigStore\`) is the **platform-provided** interface between a plugin and the GxP platform.

## IMPORTANT — This file does not exist in the plugin project

\`src/stores/gxpPortalConfigStore.js\` does NOT exist. Only \`src/stores/index.js\` exists, and it re-exports from the toolkit runtime. In production builds the import is externalized to \`window.useGxpStore\` injected by the platform. **Do not try to read or modify the store source.** Use this reference instead.

## Import

\`\`\`javascript
import { useGxpStore } from "@/stores/gxpPortalConfigStore"
const store = useGxpStore()
\`\`\`

## Reactive State (read directly)

| Property | Type | Source |
|----------|------|--------|
| \`store.pluginVars\` | Object | \`app-manifest.json → settings\` + platform-injected vars (\`projectId\`, \`formId\`, \`apiBaseUrl\`, etc.) |
| \`store.stringsList\` | Object | \`app-manifest.json → strings.default\` |
| \`store.assetList\` | Object | \`app-manifest.json → assets\` |
| \`store.dependencyList\` | Object | \`{ [identifier]: resourceId }\` — populated by the platform at runtime |
| \`store.permissionFlags\` | Array | \`app-manifest.json → permissions\` |
| \`store.triggerState\` | Object | \`app-manifest.json → triggerState\` — readable AND writable by the plugin |
| \`store.user\` | Object\|null | Authenticated user or null. Shape: \`{ id, first_name, last_name, name, email, avatar, roles[] }\` |
| \`store.theme\` | Object | Computed theme from pluginVars: \`{ background_color, text_color, primary_color, start_background_color, start_text_color, final_background_color, final_text_color }\` |
| \`store.manifestLoaded\` | boolean | true once app-manifest.json has been processed |
| \`store.portal\` | Object\|null | Platform portal context (injected by platform) |
| \`store.form\` | Store\|null | Form store for form-backed apps (see "Form Store" below). Attached when \`app-manifest.json → form\` (or \`settings.formId\`) exists; on-platform the page's ProjectForm attaches it automatically. |

## Data Getters

\`\`\`javascript
store.getString(key, fallback = "")     // stringsList[key] or fallback
store.getSetting(key, fallback = null)  // pluginVars[key] or fallback
store.getAsset(key, fallback = "")      // assetList[key] or fallback
store.getState(key, fallback = null)    // triggerState[key] or fallback
store.hasPermission(flag)               // boolean — permissionFlags.includes(flag)
store.findDependency(identifier)        // returns the bound resource ID for an identifier
\`\`\`

## User / Auth Getters

\`\`\`javascript
store.getUser()                    // user object or null
store.getUserName(fallback = null) // display name: user.name → first_name+last_name → fallback
store.getUserEmail(fallback = null)// user.email or fallback
store.isAuthenticated()            // boolean
\`\`\`

user is null when not authenticated — always guard before dereferencing. In gxdev dev a dummy user is provided; in production the platform injects the real authenticated user.

## Platform API — store.callApi

Every call to the GxP platform goes through callApi. It handles auth, URL resolution, team/project scoping, and path-parameter substitution.

\`\`\`javascript
const result = await store.callApi(operationId, identifier, data)
\`\`\`

| Arg | Description |
|-----|-------------|
| operationId | OpenAPI operationId (e.g. "posts.index", "forms.show"). Auto-prefixes with portal.v1.project. if bare ID not found. Discover with api_list_operation_ids / search_api_endpoints. |
| identifier | Permission identifier from app-manifest.json → dependencies (e.g. "quiz_form") OR the reserved "project" for project-wide operations. |
| data | Body/query/path params. A value like "pluginVars.keyName" is resolved from pluginVars at call time. teamSlug, projectSlug, and form (when pluginVars.formId exists) are auto-injected. |

Returns parsed response data. Throws on HTTP errors.

## Low-Level HTTP (avoid unless necessary — bypasses permission model)

\`\`\`javascript
await store.apiGet(endpoint, params = {})
await store.apiPost(endpoint, data = {})
await store.apiPut(endpoint, data = {})
await store.apiPatch(endpoint, data = {})
await store.apiDelete(endpoint)
\`\`\`

## Real-Time Events

### store.listen (polymorphic)

Form 1 — named socket (e.g. primary peer channel):
\`\`\`javascript
const unsub = store.listen("primary", "cursor_moved", (data) => { ... })
unsub() // unsubscribe
\`\`\`

Form 2 — platform AsyncAPI event scoped to a permission identifier:
\`\`\`javascript
const unsub = store.listen("SomeEventName", "identifier", (data) => { ... })
// identifier must be declared in app-manifest.json → dependencies, or "project"
\`\`\`

Returns an unsubscribe function. Logs a warning if the identifier is not bound in dependencyList.

### store.broadcast

\`\`\`javascript
store.broadcast("primary", "event-name", data)  // returns boolean
\`\`\`

## Writable State

triggerState is the only section designed to be written by plugins at runtime (Pinia unwraps the ref):

\`\`\`javascript
store.triggerState['current_step'] = 3
store.triggerState['is_active'] = true
\`\`\`

Do NOT write to pluginVars, stringsList, or assetList — these are platform-managed and will be overwritten on manifest reload.

## Form Store — store.form

Form-backed apps get a per-form store attached as \`store.form\` — the same interface plugins see on-platform. It is \`null\` unless \`app-manifest.json\` has a \`form\` section (or \`settings.formId\`), or the app calls \`store.attachFormStore(formKeyOrStore)\`.

### Schema helpers

\`\`\`javascript
store.form.getSections()      // nested sections: { id, title, fields[], sections[] } (visibility-filtered when conditions enabled)
store.form.getElements()      // flat list of fields (normalized: slug, label, type, required, default_value, validation_rules, condition_params)
store.form.getElement(slug)   // one field or null
store.form.schema             // computed { name, slug, sections } with conditions applied
\`\`\`

### Form data

\`\`\`javascript
store.form.formData           // reactive slug-keyed data object (seeded: defaults → prefillData → resume data)
store.form.getData() / getValue(slug) / setValue(slug, value) / setData({ ... })
\`\`\`

### Validation

\`\`\`javascript
store.form.validateField(slug)  // error message or null; recorded in store.form.errors
store.form.validateForm()       // boolean; populates store.form.errors
store.form.errors               // slug-keyed error map
store.form.isValid              // computed boolean
\`\`\`

Supports required + type checks (email/phone/number) and Laravel-style string rules (required, email, numeric, min, max, in, regex). The server remains authoritative.

### Conditional visibility

\`\`\`javascript
store.form.setConditionalProcessing(true)  // or "conditions": true in the manifest form section
\`\`\`

When enabled, getSections/getElements evaluate each node's \`condition_params\` against formData and hidden fields are skipped by validation.

### Submission

\`\`\`javascript
const result = await store.form.submit(extra = {}, { validate: true })
await store.form.confirmUpdateExisting(attendeeId)   // after a 409 duplicate prompt
await store.form.saveProgress(contactValue)          // resumable forms
store.form.processing / store.form.submitted / store.form.lastResult
\`\`\`

In dev, submit resolves in order: \`form.mockResponses.submit\` from the manifest → real POST to the registration-form API under the configured apiBaseUrl → simulated \`{ success: true, simulated: true }\` result. Every delivery is console-logged and broadcast as a \`gxp:form-submit\` CustomEvent on window. 422 responses map onto \`store.form.errors\`; 409 duplicate payloads are returned for the app to prompt on.

### Manifest configuration (app-manifest.json → form)

\`\`\`json
{
	"form": {
		"formId": "my-registration-form",
		"schema": { "root": { "cardList": ["card-1"] }, "cards": { "card-1": { "id": "card-1", "elementList": ["el-1"] } }, "elements": { "el-1": { "id": "el-1", "name": "first_name", "type": "input", "label": "First Name", "required": true } } },
		"prefillData": { "first_name": "Jane" },
		"conditions": true,
		"mockResponses": { "submit": { "success": true, "status": "created" } }
	}
}
\`\`\`

\`schema\` accepts the v2 shape ({ root, cards, elements }) or \`{ sections: [...] }\`; a top-level \`sections\` array also works. Hot-reloaded with the rest of the manifest (formData resets on reload).

## Dev-Only Helpers

\`\`\`javascript
store.addDevAsset(key, filename)  // adds /dev-assets/images/<filename> with dev-server URL prefix
store.listAssets()                // logs all assetList entries to console, returns the object
store.attachFormStore(keyOrStore) // attach/create the form store manually (returns it)
\`\`\`

## Deprecated (do not use — kept for backwards compatibility only)

\`\`\`javascript
store.emitSocket(...)         // → store.broadcast(...)
store.listenSocket(...)       // → store.listen(...)
store.useSocketListener(...)  // → store.listen(...)
\`\`\`
`

function describeStoreApi() {
	return { ok: true, reference: STORE_API_REFERENCE }
}

const MODEL_TOOLS = [
	{
		name: "describe_store_api",
		description:
			"Returns the complete GxP store (gxpPortalConfigStore) API reference: all reactive state, getter methods, callApi signature, listen/broadcast, writable state, and deprecated aliases. Call this before writing any store-related code — the store file does NOT exist in plugin projects and must not be read from disk.",
		inputSchema: { type: "object", properties: {} },
	},
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
		case "describe_store_api":
			return contentResult(describeStoreApi())
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
	describeStoreApi,
	describeDataModels,
	summarizeProperties,
	resolveRef,
}
