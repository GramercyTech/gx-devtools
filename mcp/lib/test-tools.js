/**
 * MCP tools for plugin testing:
 *
 *   - test_scaffold_component_test : writes a Vitest + Vue Test Utils file
 *     for a given Vue component, with render/props/events placeholders.
 *
 *   - test_api_route : resolves an OpenAPI operationId to method+path,
 *     substitutes path parameters, and hits the local mock API (default
 *     http://localhost:3069/api) with optional query and body, returning
 *     status, headers, and response body.
 */

const fs = require("fs")
const path = require("path")

const { fetchSpec } = require("./specs")

function contentResult(obj) {
	return {
		content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
	}
}

function resolveProjectPath(p) {
	if (!p) throw new Error("`path` argument is required")
	return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p)
}

/* ------------------------- scaffold_component_test ----------------------- */

function componentNameFromFile(componentPath) {
	const base = path.basename(componentPath).replace(/\.vue$/i, "")
	return base.replace(/[^A-Za-z0-9_$]/g, "_") || "Component"
}

function defaultTestPathFor(componentAbsPath, projectRoot) {
	const rel = path.relative(projectRoot, componentAbsPath)
	const base = path.basename(rel, ".vue")
	// Siblings to the project root: tests/<Component>.test.js
	return path.join(projectRoot, "tests", `${base}.test.js`)
}

function renderScaffold({ componentName, importPath }) {
	return `import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import ${componentName} from "${importPath}"

describe("${componentName}", () => {
	it("renders the component", () => {
		const wrapper = mount(${componentName})
		expect(wrapper.exists()).toBe(true)
	})

	it.todo("renders expected headings/labels")

	it.todo("accepts props")

	it.todo("emits events on interaction")
})
`
}

function toImportPath(absComponent, absTestFile, projectRoot) {
	// Prefer the "@/…" alias when the component lives under <projectRoot>/src.
	const srcDir = path.join(projectRoot, "src")
	if (absComponent.startsWith(srcDir + path.sep) || absComponent === srcDir) {
		const rel = path.relative(srcDir, absComponent).replace(/\\/g, "/")
		return `@/${rel}`
	}
	// Fall back to a relative path from the test file.
	const rel = path.relative(path.dirname(absTestFile), absComponent)
	const norm = rel.replace(/\\/g, "/")
	return norm.startsWith(".") ? norm : `./${norm}`
}

function scaffoldComponentTest({
	componentPath,
	testPath,
	componentName,
	overwrite = false,
	projectRoot,
}) {
	const projRoot = projectRoot || process.cwd()
	const absComponent = resolveProjectPath(componentPath)
	if (!fs.existsSync(absComponent)) {
		return { ok: false, error: `Component not found: ${absComponent}` }
	}

	const absTest = testPath
		? resolveProjectPath(testPath)
		: defaultTestPathFor(absComponent, projRoot)
	const name = componentName || componentNameFromFile(absComponent)
	const importPath = toImportPath(absComponent, absTest, projRoot)

	if (fs.existsSync(absTest) && !overwrite) {
		return {
			ok: false,
			error: `Test already exists at ${absTest}. Pass overwrite: true to replace.`,
			test_path: absTest,
		}
	}

	fs.mkdirSync(path.dirname(absTest), { recursive: true })
	fs.writeFileSync(
		absTest,
		renderScaffold({ componentName: name, importPath }),
		"utf-8",
	)
	return {
		ok: true,
		test_path: absTest,
		component_name: name,
		import_path: importPath,
		run_with: "npx vitest run " + path.relative(projRoot, absTest),
	}
}

/* ------------------------------ test_api_route --------------------------- */

function substitutePathParams(rawPath, params = {}) {
	// Replace /path/{name} and /path/:name with the given values.
	const missing = []
	let out = rawPath.replace(/\{([^}]+)\}/g, (_m, name) => {
		if (params[name] === undefined || params[name] === null) {
			missing.push(name)
			return `{${name}}`
		}
		return encodeURIComponent(String(params[name]))
	})
	out = out.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_m, name) => {
		if (params[name] === undefined || params[name] === null) {
			missing.push(name)
			return `:${name}`
		}
		return encodeURIComponent(String(params[name]))
	})
	return { path: out, missing }
}

function buildQueryString(query) {
	if (!query || typeof query !== "object") return ""
	const params = new URLSearchParams()
	for (const [k, v] of Object.entries(query)) {
		if (v === undefined || v === null) continue
		if (Array.isArray(v)) {
			for (const item of v) params.append(k, String(item))
		} else {
			params.set(k, String(v))
		}
	}
	const s = params.toString()
	return s ? `?${s}` : ""
}

function findOperation(spec, operationId) {
	if (!spec?.paths) return null
	for (const [p, methods] of Object.entries(spec.paths)) {
		for (const [method, op] of Object.entries(methods)) {
			if (typeof op === "object" && op?.operationId === operationId) {
				return { path: p, method: method.toUpperCase(), op }
			}
		}
	}
	return null
}

async function testApiRoute({
	operationId,
	pathParams,
	query,
	body,
	headers,
	baseUrl,
	timeoutMs,
}) {
	const spec = await fetchSpec("openapi")
	const found = findOperation(spec, operationId)
	if (!found) {
		return { ok: false, error: `Operation not found: ${operationId}` }
	}

	const { path: rawPath, method } = found
	const { path: resolvedPath, missing } = substitutePathParams(
		rawPath,
		pathParams,
	)
	if (missing.length > 0) {
		return {
			ok: false,
			error: `Missing required path parameters: ${missing.join(", ")}`,
			required_parameters: missing,
		}
	}

	const base = (baseUrl || "http://localhost:3069/api").replace(/\/+$/, "")
	const url = `${base}${resolvedPath}${buildQueryString(query)}`

	const controller = new AbortController()
	const timer = setTimeout(
		() => controller.abort(),
		Math.max(1000, timeoutMs ?? 10000),
	)
	const t0 = Date.now()
	try {
		const hasBody =
			body !== undefined && body !== null && !["GET", "HEAD"].includes(method)
		const res = await fetch(url, {
			method,
			signal: controller.signal,
			headers: {
				Accept: "application/json",
				...(hasBody ? { "Content-Type": "application/json" } : {}),
				...(headers || {}),
			},
			body: hasBody ? JSON.stringify(body) : undefined,
		})

		const duration_ms = Date.now() - t0
		const respHeaders = {}
		res.headers.forEach((v, k) => {
			respHeaders[k] = v
		})
		const raw = await res.text()
		let parsedBody = raw
		try {
			parsedBody = JSON.parse(raw)
		} catch {
			// keep as text
		}

		return {
			ok: res.ok,
			request: {
				method,
				url,
			},
			response: {
				status: res.status,
				statusText: res.statusText,
				headers: respHeaders,
				body: parsedBody,
			},
			duration_ms,
		}
	} catch (err) {
		const duration_ms = Date.now() - t0
		return {
			ok: false,
			request: { method, url },
			error: err.name === "AbortError" ? "Request timed out" : err.message,
			duration_ms,
		}
	} finally {
		clearTimeout(timer)
	}
}

/* ------------------------------- tool schemas ----------------------------- */

const TEST_TOOLS = [
	{
		name: "test_scaffold_component_test",
		description:
			"Create a Vitest + Vue Test Utils test file for a given Vue component. Picks an import path via the @/ alias when the component lives under src/, else falls back to a relative path. Refuses to overwrite unless overwrite=true.",
		inputSchema: {
			type: "object",
			properties: {
				componentPath: {
					type: "string",
					description:
						"Absolute or project-relative path to the .vue file to test.",
				},
				testPath: {
					type: "string",
					description:
						"Optional override for where to write the test file. Default: tests/<ComponentName>.test.js at the project root.",
				},
				componentName: {
					type: "string",
					description:
						"Optional override for the identifier used in the test. Default: the component filename without extension.",
				},
				overwrite: { type: "boolean", default: false },
			},
			required: ["componentPath"],
		},
	},
	{
		name: "test_api_route",
		description:
			"Exercise a single API endpoint by operationId. Resolves the OpenAPI spec to method+path, substitutes path params, and issues a request. Defaults to the local mock API at http://localhost:3069/api — override via baseUrl to hit staging/develop. Returns status, headers, parsed body, and duration.",
		inputSchema: {
			type: "object",
			properties: {
				operationId: {
					type: "string",
					description: "OpenAPI operationId (e.g. 'attendees.index').",
				},
				pathParams: {
					type: "object",
					description:
						"Values for {param} / :param segments in the path, keyed by parameter name.",
				},
				query: {
					type: "object",
					description:
						"Query-string values keyed by parameter name. Arrays send repeated keys.",
				},
				body: {
					description: "Request body. Sent as JSON for non-GET/HEAD methods.",
				},
				headers: {
					type: "object",
					description: "Additional headers to include.",
				},
				baseUrl: {
					type: "string",
					description:
						"Override the base URL. Default: http://localhost:3069/api (the toolkit's mock API mount).",
				},
				timeoutMs: {
					type: "integer",
					description: "Abort after N ms. Default 10000.",
				},
			},
			required: ["operationId"],
		},
	},
]

async function handleTestToolCall(name, args = {}) {
	switch (name) {
		case "test_scaffold_component_test":
			return contentResult(scaffoldComponentTest(args))

		case "test_api_route":
			return contentResult(await testApiRoute(args))

		default:
			throw new Error(`Unknown test tool: ${name}`)
	}
}

function isTestTool(name) {
	return TEST_TOOLS.some((t) => t.name === name)
}

module.exports = {
	TEST_TOOLS,
	handleTestToolCall,
	isTestTool,
	// Exported for testing
	scaffoldComponentTest,
	substitutePathParams,
	buildQueryString,
	findOperation,
	testApiRoute,
}
