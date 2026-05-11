/**
 * MCP tools for @gxp-dev/uikit introspection.
 *
 *   - list_uikit_components : enumerate components exported by the version
 *     of @gxp-dev/uikit installed in the *plugin project's* node_modules
 *     (not the toolkit's). Resolves the package relative to process.cwd(),
 *     parses named exports out of dist/index.d.ts, and returns sorted
 *     PascalCase names plus the package version.
 *
 * We parse the .d.ts with a regex pair (no TS AST) because the file is the
 * built output and is shaped by the package's own build, not by us. Edge
 * cases that the regex misses (e.g. nested namespace exports) are
 * acceptable: the agent gets a strong starting set and can fall back to
 * docs_search for anything unusual.
 */

const fs = require("fs")
const path = require("path")

function contentResult(obj) {
	return {
		content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
	}
}

/**
 * Resolve @gxp-dev/uikit from the given cwd. Returns { root, pkg } where
 * root is the absolute path to the uikit package directory and pkg is the
 * parsed package.json, or null if uikit is not installed at any level.
 *
 * We mimic Node's node_modules walk-up rather than calling
 * require.resolve("@gxp-dev/uikit/...") because the uikit's package.json
 * declares a strict `exports` field with only `import` and `types`
 * conditions. From a CJS context, require.resolve fails against that
 * exports map even though the directory exists on disk. Walking the
 * filesystem directly sidesteps it and works under npm, pnpm (where
 * @gxp-dev/uikit is a symlink into .pnpm), and yarn workspaces.
 */
function resolveUikit(cwd = process.cwd()) {
	let dir = path.resolve(cwd)
	while (dir) {
		const candidate = path.join(dir, "node_modules", "@gxp-dev", "uikit")
		const pkgPath = path.join(candidate, "package.json")
		if (fs.existsSync(pkgPath)) {
			try {
				const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
				if (pkg && pkg.name === "@gxp-dev/uikit") {
					return { root: candidate, pkg }
				}
			} catch {
				// malformed package.json — keep walking
			}
		}
		const parent = path.dirname(dir)
		if (parent === dir) break
		dir = parent
	}
	return null
}

/**
 * Pull named exports out of a .d.ts source string. Picks up:
 *   - export declare const/let/var Foo
 *   - export declare function Foo
 *   - export declare class Foo
 *   - export declare interface Foo
 *   - export declare type Foo
 *   - export declare enum Foo
 *   - export { Foo, Bar as Baz }
 */
function parseNamedExports(source) {
	const names = new Set()

	const declRe =
		/export\s+(?:declare\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g
	let m
	while ((m = declRe.exec(source)) !== null) {
		names.add(m[1])
	}

	const braceRe = /export\s*\{([^}]+)\}/g
	while ((m = braceRe.exec(source)) !== null) {
		const inner = m[1]
		for (const rawPart of inner.split(",")) {
			const part = rawPart.trim()
			if (!part) continue
			const aliasMatch = part.match(
				/^[A-Za-z_$][A-Za-z0-9_$]*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
			)
			if (aliasMatch) {
				names.add(aliasMatch[1])
				continue
			}
			const nameMatch = part.match(/^([A-Za-z_$][A-Za-z0-9_$]*)/)
			if (nameMatch) names.add(nameMatch[1])
		}
	}

	return Array.from(names)
}

function listUikitComponents({ filter, cwd } = {}) {
	const resolved = resolveUikit(cwd || process.cwd())
	if (!resolved) {
		return {
			ok: false,
			error:
				"Could not resolve @gxp-dev/uikit from the current project. Install it with `npm install @gxp-dev/uikit` and re-run mcp-serve from the plugin project root.",
		}
	}
	const { root, pkg } = resolved
	const dtsPath = path.join(root, "dist", "index.d.ts")
	if (!fs.existsSync(dtsPath)) {
		return {
			ok: false,
			error: `@gxp-dev/uikit is installed at ${root} but dist/index.d.ts is missing. The package may not have been built.`,
			resolved: root,
		}
	}

	const src = fs.readFileSync(dtsPath, "utf-8")
	const all = parseNamedExports(src)
	const pascal = all.filter((n) => /^[A-Z]/.test(n)).sort()

	let filtered = pascal
	if (filter) {
		const f = String(filter).toLowerCase()
		filtered = pascal.filter((n) => n.toLowerCase().includes(f))
	}

	return {
		ok: true,
		package: {
			name: pkg.name,
			version: pkg.version || null,
			root,
		},
		count: filtered.length,
		components: filtered,
	}
}

const UIKIT_TOOLS = [
	{
		name: "list_uikit_components",
		description:
			"Enumerate components exported by the @gxp-dev/uikit package installed in the current plugin project. Reads named exports from the built dist/index.d.ts and returns the PascalCase names plus the package version. Resolves uikit relative to the project (process.cwd()), not the toolkit, so the agent sees exactly what the project can import. Pass `filter` for a case-insensitive substring match.",
		inputSchema: {
			type: "object",
			properties: {
				filter: {
					type: "string",
					description:
						"Case-insensitive substring filter applied to component names.",
				},
			},
		},
	},
]

async function handleUikitToolCall(name, args = {}) {
	switch (name) {
		case "list_uikit_components":
			return contentResult(listUikitComponents(args))
		default:
			throw new Error(`Unknown uikit tool: ${name}`)
	}
}

function isUikitTool(name) {
	return UIKIT_TOOLS.some((t) => t.name === name)
}

module.exports = {
	UIKIT_TOOLS,
	handleUikitToolCall,
	isUikitTool,
	listUikitComponents,
	parseNamedExports,
	resolveUikit,
}
