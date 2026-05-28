/**
 * AppUI resolution helpers.
 *
 * Resolves `@gxp-dev/app-ui` from a plugin project's node_modules by walking
 * up the directory tree (works with npm, pnpm, yarn workspaces). We mimic the
 * walk-up rather than calling require.resolve("@gxp-dev/app-ui/...") because
 * app-ui's package.json declares a strict `exports` field with only
 * `import` + `types` conditions; from a CJS context require.resolve fails
 * against that exports map even though the directory exists on disk.
 */

const fs = require("fs")
const path = require("path")

/**
 * @returns {{ root: string, pkg: object } | null}
 */
function resolveAppUi(cwd = process.cwd()) {
	let dir = path.resolve(cwd)
	while (dir) {
		const candidate = path.join(dir, "node_modules", "@gxp-dev", "app-ui")
		const pkgPath = path.join(candidate, "package.json")
		if (fs.existsSync(pkgPath)) {
			try {
				const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
				if (pkg && pkg.name === "@gxp-dev/app-ui") {
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

module.exports = { resolveAppUi }
