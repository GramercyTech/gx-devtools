/**
 * GxP JSON Config Linter
 *
 * Validates `configuration.json` and `app-manifest.json` against JSON Schemas
 * derived from the GxP templating system documentation. Schemas live in
 * ./schemas/ and are composed via $ref.
 *
 * Public API:
 *   - detectSchema(filePath): pick the correct schema for a file, or null.
 *   - lintFile(filePath): return { file, ok, errors[] }.
 *   - lintFiles(files): return aggregated results.
 */

const fs = require("fs")
const path = require("path")
const Ajv = require("ajv/dist/2020")
const addFormats = require("ajv-formats")

const SCHEMA_DIR = path.join(__dirname, "schemas")

const SCHEMA_FILES = [
	"common.schema.json",
	"field.schema.json",
	"card.schema.json",
	"configuration.schema.json",
	"app-manifest.schema.json",
]

let cachedAjv = null

function getAjv() {
	if (cachedAjv) {
		return cachedAjv
	}
	const ajv = new Ajv({
		allErrors: true,
		strict: false,
		allowUnionTypes: true,
		verbose: true,
	})
	addFormats(ajv)

	for (const fileName of SCHEMA_FILES) {
		const schemaPath = path.join(SCHEMA_DIR, fileName)
		const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"))
		// Reference schemas by their bare filename (how siblings $ref each other).
		ajv.addSchema(schema, fileName)
	}

	cachedAjv = ajv
	return ajv
}

/**
 * Given a file path, decide which root schema should validate it.
 * Matches exact filenames `configuration.json` / `app-manifest.json` and also
 * suffixed variants like `broken-configuration.json` so users can keep multiple
 * samples around during development. Returns the schema filename or null.
 */
function detectSchema(filePath) {
	const base = path.basename(filePath)
	if (base === "configuration.json" || /configuration\.json$/i.test(base)) {
		return "configuration.schema.json"
	}
	if (base === "app-manifest.json" || /app-manifest\.json$/i.test(base)) {
		return "app-manifest.schema.json"
	}
	return null
}

/**
 * Walk a JSON document by dotted/bracketed pointer to locate a value.
 * Falls back to the document start if the path is unresolvable — good enough
 * for error location heuristics; the AJV path is always printed too.
 */
function locateInSource(source, instancePath) {
	if (!instancePath || instancePath === "") {
		return { line: 1, column: 1 }
	}

	// Split AJV 2020-12 JSON pointer: "/additionalTabs/0/cards/1/fieldsList/0/type"
	const segments = instancePath.split("/").filter(Boolean)
	let cursor = 0
	let line = 1
	let column = 1

	// Simple forward scanner: find each segment's appearance after current cursor.
	// Good enough for error pinpointing; not a full JSON parser.
	for (const rawSegment of segments) {
		const segment = decodeURIComponent(
			rawSegment.replace(/~1/g, "/").replace(/~0/g, "~"),
		)
		let needle
		if (/^\d+$/.test(segment)) {
			// Array index — scan forward to the Nth top-level "," or "[" after cursor.
			// Cheap approximation: skip.
			needle = null
		} else {
			needle = `"${segment}"`
		}
		if (needle) {
			const next = source.indexOf(needle, cursor)
			if (next >= 0) {
				cursor = next + needle.length
			}
		}
	}

	for (let i = 0; i < cursor && i < source.length; i++) {
		if (source[i] === "\n") {
			line++
			column = 1
		} else {
			column++
		}
	}
	return { line, column }
}

/**
 * Lint a single file. Returns a result object; never throws for validation or
 * JSON-parse errors (those become errors in the result).
 */
function lintFile(filePath) {
	const absPath = path.resolve(filePath)
	const result = {
		file: absPath,
		ok: true,
		skipped: false,
		reason: null,
		errors: [],
	}

	if (!fs.existsSync(absPath)) {
		result.ok = false
		result.errors.push({
			code: "file-not-found",
			message: `File not found: ${absPath}`,
			line: 1,
			column: 1,
			instancePath: "",
		})
		return result
	}

	const schemaKey = detectSchema(absPath)
	if (!schemaKey) {
		result.skipped = true
		result.reason = "no-schema-for-filename"
		return result
	}

	const source = fs.readFileSync(absPath, "utf-8")
	let data
	try {
		data = JSON.parse(source)
	} catch (e) {
		result.ok = false
		result.errors.push({
			code: "json-parse-error",
			message: `Invalid JSON: ${e.message}`,
			line: 1,
			column: 1,
			instancePath: "",
		})
		return result
	}

	const ajv = getAjv()
	const validate = ajv.getSchema(schemaKey)
	const valid = validate(data)
	if (!valid) {
		result.ok = false
		const seen = new Set()
		for (const err of validate.errors || []) {
			// Drop AJV's meta-errors that just restate "a nested if/then failed" —
			// the real cause is the nested error itself, which we also have.
			if (err.keyword === "if" || err.keyword === "allOf") {
				continue
			}
			// Collapse duplicates that AJV emits when an inner schema is reached
			// via multiple schemaPaths (e.g. through if/then and directly).
			const dedupeKey = `${err.keyword}|${err.instancePath}|${err.params?.missingProperty || ""}|${err.params?.additionalProperty || ""}|${err.params?.allowedValue || ""}`
			if (seen.has(dedupeKey)) {
				continue
			}
			seen.add(dedupeKey)

			const { line, column } = locateInSource(source, err.instancePath)
			result.errors.push({
				code: err.keyword,
				message: formatAjvMessage(err),
				line,
				column,
				instancePath: err.instancePath || "/",
				schemaPath: err.schemaPath,
				params: err.params,
			})
		}
	}
	return result
}

function formatAjvMessage(err) {
	const at = err.instancePath || "(root)"
	const core = err.message || "failed validation"
	const hints = []
	if (err.keyword === "enum" && err.params?.allowedValues) {
		hints.push(`allowed: ${err.params.allowedValues.join(", ")}`)
	}
	if (err.keyword === "required" && err.params?.missingProperty) {
		return `${at} missing required property "${err.params.missingProperty}"`
	}
	if (err.keyword === "type" && err.params?.type) {
		return `${at} must be ${err.params.type}`
	}
	if (
		err.keyword === "additionalProperties" &&
		err.params?.additionalProperty
	) {
		return `${at} has unexpected property "${err.params.additionalProperty}"`
	}
	const tail = hints.length ? ` (${hints.join("; ")})` : ""
	return `${at} ${core}${tail}`
}

function lintFiles(files) {
	const results = files.map((f) => lintFile(f))
	const summary = {
		totalFiles: results.length,
		filesWithErrors: results.filter((r) => !r.ok).length,
		skipped: results.filter((r) => r.skipped).length,
		totalErrors: results.reduce((n, r) => n + r.errors.length, 0),
	}
	return { results, summary }
}

/**
 * Validate an already-parsed JSON value. `pathHint` is only used to pick the
 * right root schema (via detectSchema). Useful for MCP tools that want to
 * validate a prospective edit before touching disk.
 */
function lintData(data, pathHint) {
	const result = { ok: true, skipped: false, reason: null, errors: [] }
	const schemaKey = detectSchema(pathHint)
	if (!schemaKey) {
		result.skipped = true
		result.reason = "no-schema-for-filename"
		return result
	}

	const ajv = getAjv()
	const validate = ajv.getSchema(schemaKey)
	const valid = validate(data)
	if (!valid) {
		result.ok = false
		const seen = new Set()
		for (const err of validate.errors || []) {
			if (err.keyword === "if" || err.keyword === "allOf") continue
			const dedupeKey = `${err.keyword}|${err.instancePath}|${err.params?.missingProperty || ""}|${err.params?.additionalProperty || ""}`
			if (seen.has(dedupeKey)) continue
			seen.add(dedupeKey)

			result.errors.push({
				code: err.keyword,
				message: formatAjvMessage(err),
				line: 1,
				column: 1,
				instancePath: err.instancePath || "/",
				schemaPath: err.schemaPath,
				params: err.params,
			})
		}
	}
	return result
}

module.exports = {
	detectSchema,
	lintFile,
	lintFiles,
	lintData,
	SCHEMA_DIR,
}
