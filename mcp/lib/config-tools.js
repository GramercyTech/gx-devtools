/**
 * MCP tools for reading and mutating GxP configuration.json /
 * app-manifest.json files. All mutations are linted before they touch disk:
 * if the edit would produce an invalid document, the tool refuses to save and
 * returns the errors, unless the caller passes `force: true`.
 *
 * Paths referenced from outside the project root are accepted as absolute; any
 * other path is resolved relative to process.cwd() (which is typically the
 * consumer project when the MCP server is spawned by an AI tool).
 */

const fs = require("fs")
const path = require("path")

const {
	getByPointer,
	setByPointer,
	deleteByPointer,
	insertAt,
	moveItem,
	listCards,
	listFields,
} = require("./config-ops")

// Reuse the Phase-1 linter; published as a sibling of the MCP dir.
const lintDir = path.resolve(__dirname, "../../bin/lib/lint")
const { lintFile, lintData, detectSchema } = require(lintDir)

// Reuse the existing extract-config utility (same logic as `gxdev extract-config`).
const extractUtil = require(
	path.resolve(__dirname, "../../bin/lib/utils/extract-config"),
)

const SCHEMA_DIR = path.join(lintDir, "schemas")

/* ----------------------------- shared helpers ---------------------------- */

function resolveProjectPath(p) {
	if (!p) {
		throw new Error("`path` argument is required")
	}
	return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p)
}

function readJson(absPath) {
	const src = fs.readFileSync(absPath, "utf-8")
	try {
		return JSON.parse(src)
	} catch (e) {
		throw new Error(`Invalid JSON in ${absPath}: ${e.message}`)
	}
}

/**
 * Write `doc` to `absPath`, but only after linting the prospective contents
 * in-memory. Returns { ok, errors, wrote }. Disk is untouched on failure
 * unless `force: true`.
 */
function writeLinted(absPath, doc, { force = false } = {}) {
	const result = lintData(doc, absPath)
	if (!result.ok && !force) {
		return { ok: false, errors: result.errors, wrote: false }
	}
	fs.writeFileSync(absPath, JSON.stringify(doc, null, "\t"), "utf-8")
	return {
		ok: result.ok,
		errors: result.errors,
		wrote: true,
		forced: !result.ok && force,
	}
}

function readSchemaFile(name) {
	return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name), "utf-8"))
}

function contentResult(obj) {
	return {
		content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
	}
}

/* ------------------------------ tool schemas ----------------------------- */

const CONFIG_TOOLS = [
	{
		name: "config_validate",
		description:
			"Validate a GxP configuration.json or app-manifest.json against the templating schema. Returns {ok, errors[]}.",
		inputSchema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "Absolute or project-relative path to the JSON file.",
				},
			},
			required: ["path"],
		},
	},
	{
		name: "config_list_field_types",
		description:
			"List every field type the linter accepts (e.g. 'text', 'select', 'asyncSelect').",
		inputSchema: { type: "object", properties: {}, required: [] },
	},
	{
		name: "config_list_card_types",
		description:
			"List every card type the linter accepts (e.g. 'fields_list', 'card_list', 'tabs_list').",
		inputSchema: { type: "object", properties: {}, required: [] },
	},
	{
		name: "config_get_field_schema",
		description:
			"Return the JSON schema for a specific field type, including its required properties and common options. Use this before writing a new field to see what shape it needs.",
		inputSchema: {
			type: "object",
			properties: {
				type: {
					type: "string",
					description: "Field type, e.g. 'text' or 'select'.",
				},
			},
			required: ["type"],
		},
	},
	{
		name: "config_list_cards",
		description:
			"List every card in a configuration.json with its JSON pointer, type, title, and field count. Use the returned `path` as the target for add/move/remove calls.",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string", description: "Path to configuration.json" },
			},
			required: ["path"],
		},
	},
	{
		name: "config_list_fields",
		description:
			"List every field inside a specific fields_list card, with JSON pointers.",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string", description: "Path to configuration.json" },
				card_path: {
					type: "string",
					description:
						"JSON pointer to the fields_list card (from config_list_cards).",
				},
			},
			required: ["path", "card_path"],
		},
	},
	{
		name: "config_add_field",
		description:
			"Add a field to a fields_list card. Validates the resulting document; rejects the save if it would be invalid (unless force=true).",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string" },
				card_path: {
					type: "string",
					description: "JSON pointer to the fields_list card.",
				},
				field: {
					type: "object",
					description:
						"Field definition to insert. Must include `type` and (for most types) `name`.",
				},
				position: {
					type: ["integer", "string"],
					description: "Index to insert at, or 'end' (default).",
				},
				force: { type: "boolean", default: false },
			},
			required: ["path", "card_path", "field"],
		},
	},
	{
		name: "config_move_field",
		description:
			"Move a field from one position in a fields_list to another (same card or different card).",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string" },
				from_path: {
					type: "string",
					description: "JSON pointer to the field.",
				},
				to_card_path: {
					type: "string",
					description: "JSON pointer to the destination fields_list card.",
				},
				position: {
					type: ["integer", "string"],
					description: "Index in the destination, or 'end' (default).",
				},
				force: { type: "boolean", default: false },
			},
			required: ["path", "from_path", "to_card_path"],
		},
	},
	{
		name: "config_remove_field",
		description: "Remove a field by JSON pointer.",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string" },
				field_path: {
					type: "string",
					description: "JSON pointer to the field to remove.",
				},
				force: { type: "boolean", default: false },
			},
			required: ["path", "field_path"],
		},
	},
	{
		name: "config_add_card",
		description:
			"Add a card under a parent container (additionalTabs, a card_list's cards[], or a tabs_list tab).",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string" },
				parent_path: {
					type: "string",
					description:
						"JSON pointer to the parent array of cards (e.g. '/additionalTabs' or '/additionalTabs/0/cards').",
				},
				card: {
					type: "object",
					description:
						"Card definition. Must include `type`. For fields_list, include `fieldsList: []`.",
				},
				position: {
					type: ["integer", "string"],
					description: "Index or 'end' (default).",
				},
				force: { type: "boolean", default: false },
			},
			required: ["path", "parent_path", "card"],
		},
	},
	{
		name: "config_move_card",
		description: "Move a card from one container to another.",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string" },
				from_path: { type: "string", description: "JSON pointer to the card." },
				to_parent_path: {
					type: "string",
					description: "JSON pointer to the destination array of cards.",
				},
				position: {
					type: ["integer", "string"],
					description: "Index in destination, or 'end' (default).",
				},
				force: { type: "boolean", default: false },
			},
			required: ["path", "from_path", "to_parent_path"],
		},
	},
	{
		name: "config_remove_card",
		description: "Remove a card by JSON pointer.",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string" },
				card_path: { type: "string" },
				force: { type: "boolean", default: false },
			},
			required: ["path", "card_path"],
		},
	},
	{
		name: "config_extract_strings",
		description:
			"Scan a plugin's src/ directory for GxP datastore usage and directives (gxp-string, gxp-src, store.getString/getSetting/getAsset/getState calls) and return the extracted keys. Optionally merge them into app-manifest.json (linter-guarded — invalid writes are refused unless force=true).",
		inputSchema: {
			type: "object",
			properties: {
				src_dir: {
					type: "string",
					description:
						"Directory to scan. Default: `src/` inside the project root (cwd).",
				},
				writeTo: {
					type: "string",
					description:
						"Optional absolute/relative path to an app-manifest.json. When provided, extracted entries are merged and the file is rewritten.",
				},
				overwrite: {
					type: "boolean",
					default: false,
					description:
						"If writing, overwrite existing values in the manifest. Default false (only fills in keys that don't yet exist).",
				},
				force: {
					type: "boolean",
					default: false,
					description:
						"Ignore lint errors on the resulting manifest when writing.",
				},
			},
			required: [],
		},
	},
]

/* -------------------------------- handlers ------------------------------- */

async function handleConfigToolCall(name, args = {}) {
	switch (name) {
		case "config_validate": {
			const abs = resolveProjectPath(args.path)
			const result = lintFile(abs)
			return contentResult({
				file: abs,
				ok: result.ok,
				skipped: result.skipped,
				errors: result.errors,
			})
		}

		case "config_list_field_types": {
			const field = readSchemaFile("field.schema.json")
			const types = field.properties?.type?.enum || []
			return contentResult({ field_types: types })
		}

		case "config_list_card_types": {
			const card = readSchemaFile("card.schema.json")
			const types = card.properties?.type?.enum || []
			return contentResult({ card_types: types })
		}

		case "config_get_field_schema": {
			const field = readSchemaFile("field.schema.json")
			const validTypes = field.properties?.type?.enum || []
			if (!validTypes.includes(args.type)) {
				return contentResult({
					error: `Unknown field type: ${args.type}`,
					valid_types: validTypes,
				})
			}

			// Walk allOf to find any conditional requirements for this type.
			const conditional = []
			for (const rule of field.allOf || []) {
				const cond = rule.if?.properties?.type
				if (!cond) continue
				const matches =
					cond.const === args.type ||
					(Array.isArray(cond.enum) && cond.enum.includes(args.type))
				if (matches && rule.then) {
					conditional.push(rule.then)
				}
			}

			return contentResult({
				type: args.type,
				base_properties: Object.keys(field.properties),
				required_baseline: field.required,
				conditional_rules: conditional,
				notes:
					"Unlisted properties are allowed. `name` is required for most interactive field types.",
			})
		}

		case "config_list_cards": {
			const abs = resolveProjectPath(args.path)
			const doc = readJson(abs)
			return contentResult({ file: abs, cards: listCards(doc) })
		}

		case "config_list_fields": {
			const abs = resolveProjectPath(args.path)
			const doc = readJson(abs)
			return contentResult({
				file: abs,
				card_path: args.card_path,
				fields: listFields(doc, args.card_path),
			})
		}

		case "config_add_field": {
			const abs = resolveProjectPath(args.path)
			const doc = readJson(abs)
			const card = getByPointer(doc, args.card_path)
			if (!card || card.type !== "fields_list") {
				throw new Error(
					`card_path must reference a fields_list card, got: ${card?.type ?? "nothing"}`,
				)
			}
			const { doc: next, index } = insertAt(
				doc,
				`${args.card_path}/fieldsList`,
				args.field,
				args.position ?? "end",
			)
			const write = writeLinted(abs, next, { force: args.force })
			return contentResult({
				...write,
				field_path: `${args.card_path}/fieldsList/${index}`,
			})
		}

		case "config_move_field": {
			const abs = resolveProjectPath(args.path)
			const doc = readJson(abs)
			const targetCard = getByPointer(doc, args.to_card_path)
			if (!targetCard || targetCard.type !== "fields_list") {
				throw new Error(
					`to_card_path must reference a fields_list card, got: ${targetCard?.type ?? "nothing"}`,
				)
			}
			const { doc: next, index } = moveItem(
				doc,
				args.from_path,
				`${args.to_card_path}/fieldsList`,
				args.position ?? "end",
			)
			const write = writeLinted(abs, next, { force: args.force })
			return contentResult({
				...write,
				new_field_path: `${args.to_card_path}/fieldsList/${index}`,
			})
		}

		case "config_remove_field": {
			const abs = resolveProjectPath(args.path)
			const doc = readJson(abs)
			const next = deleteByPointer(doc, args.field_path)
			const write = writeLinted(abs, next, { force: args.force })
			return contentResult(write)
		}

		case "config_add_card": {
			const abs = resolveProjectPath(args.path)
			const doc = readJson(abs)
			const parent = getByPointer(doc, args.parent_path)
			if (!Array.isArray(parent)) {
				throw new Error(
					`parent_path must reference an array of cards, got ${Array.isArray(parent) ? "array" : typeof parent}`,
				)
			}
			const { doc: next, index } = insertAt(
				doc,
				args.parent_path,
				args.card,
				args.position ?? "end",
			)
			const write = writeLinted(abs, next, { force: args.force })
			return contentResult({
				...write,
				card_path: `${args.parent_path}/${index}`,
			})
		}

		case "config_move_card": {
			const abs = resolveProjectPath(args.path)
			const doc = readJson(abs)
			const parent = getByPointer(doc, args.to_parent_path)
			if (!Array.isArray(parent)) {
				throw new Error(`to_parent_path must reference an array of cards`)
			}
			const { doc: next, index } = moveItem(
				doc,
				args.from_path,
				args.to_parent_path,
				args.position ?? "end",
			)
			const write = writeLinted(abs, next, { force: args.force })
			return contentResult({
				...write,
				new_card_path: `${args.to_parent_path}/${index}`,
			})
		}

		case "config_remove_card": {
			const abs = resolveProjectPath(args.path)
			const doc = readJson(abs)
			const next = deleteByPointer(doc, args.card_path)
			const write = writeLinted(abs, next, { force: args.force })
			return contentResult(write)
		}

		case "config_extract_strings": {
			const srcDir = resolveProjectPath(args.src_dir || "src")
			if (!fs.existsSync(srcDir)) {
				return contentResult({
					ok: false,
					error: `Source directory not found: ${srcDir}`,
				})
			}
			const extracted = extractUtil.extractConfigFromSource(srcDir)

			const counts = {
				strings: Object.keys(extracted.strings).length,
				settings: Object.keys(extracted.settings).length,
				assets: Object.keys(extracted.assets).length,
				triggerState: Object.keys(extracted.triggerState).length,
				dependencies: extracted.dependencies.length,
			}

			const out = { ok: true, src_dir: srcDir, counts, extracted }

			if (args.writeTo) {
				const manifestAbs = resolveProjectPath(args.writeTo)
				let existing = {}
				if (fs.existsSync(manifestAbs)) {
					existing = readJson(manifestAbs)
				}
				const merged = extractUtil.mergeConfig(existing, extracted, {
					overwrite: !!args.overwrite,
				})
				const write = writeLinted(manifestAbs, merged, {
					force: !!args.force,
				})
				out.write = { ...write, file: manifestAbs }
			}

			return contentResult(out)
		}

		default:
			throw new Error(`Unknown config tool: ${name}`)
	}
}

function isConfigTool(name) {
	return CONFIG_TOOLS.some((t) => t.name === name)
}

module.exports = {
	CONFIG_TOOLS,
	handleConfigToolCall,
	isConfigTool,
}
