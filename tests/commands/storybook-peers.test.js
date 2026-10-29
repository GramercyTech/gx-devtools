import { afterEach, describe, expect, it } from "vitest"
import { createRequire } from "node:module"
import { execFileSync, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
const require = createRequire(import.meta.url)
const { findMissingPeers } = require("../../bin/lib/commands/storybook.js")
let fixture
const peers = {
	storybook: "^10",
	vite: "^5 || ^6 || ^7 || ^8",
	"@storybook/vue3-vite": "^10",
	"@storybook/addon-mcp": "^0.7",
	"@storybook/addon-a11y": "^10",
	"@storybook/addon-themes": "^10",
	"@storybook/addon-docs": "^10",
	"@tailwindcss/vite": "^4",
	"@vitejs/plugin-vue": "^5 || ^6",
	tailwindcss: "^4",
	"tw-animate-css": "^1.4",
	"@tailwindcss/typography": "^0.5",
	typescript: "^5.9",
	"vue-component-meta": "3.3.7",
}
afterEach(() => {
	if (fixture) fs.rmSync(fixture, { recursive: true, force: true })
})
describe("installed AppUI Storybook tooling", () => {
	it("detects the complete declared toolchain and recognizes installed packages", () => {
		fixture = fs.mkdtempSync(path.join(os.tmpdir(), "gxp-storybook-peers-"))
		const pkg = { peerDependencies: { ...peers, vue: "^3.5" } }
		expect(findMissingPeers(fixture, pkg).sort()).toEqual(
			Object.entries(peers)
				.map(([name, version]) => `${name}@${version}`)
				.sort(),
		)
		for (const name of Object.keys(peers)) {
			const folder = path.join(fixture, "node_modules", name)
			fs.mkdirSync(folder, { recursive: true })
			fs.writeFileSync(path.join(folder, "package.json"), "{}")
		}
		expect(findMissingPeers(fixture, pkg)).toEqual([])
	})
	it("does not require newly added tools when an older library does not declare them", () => {
		fixture = fs.mkdtempSync(path.join(os.tmpdir(), "gxp-storybook-peers-"))
		expect(
			findMissingPeers(fixture, { peerDependencies: { storybook: "^9" } }),
		).toEqual(["storybook@^9"])
	})
})

describe("project-local AppUI CLI resolution", () => {
	const cli = fileURLToPath(
		new URL("../../bin/gx-devtools.js", import.meta.url),
	)
	function project() {
		fixture = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), "gxp-storybook-project-")),
		)
		const root = path.join(fixture, "project")
		fs.mkdirSync(root)
		fs.writeFileSync(
			path.join(root, "package.json"),
			JSON.stringify({ name: "synthetic-project", version: "1.0.0" }),
		)
		return root
	}
	function appUi(root) {
		const library = path.join(root, "node_modules", "@gxp-dev", "app-ui")
		fs.mkdirSync(path.join(library, ".storybook"), { recursive: true })
		fs.writeFileSync(
			path.join(library, "package.json"),
			JSON.stringify({
				name: "@gxp-dev/app-ui",
				version: "0.1.7",
				scripts: {
					"storybook:build": `node -e "require('node:fs').writeFileSync('storybook-proof.json',JSON.stringify({cwd:process.cwd()}))"`,
				},
			}),
		)
		return library
	}
	it("runs the installed project's Storybook build without a toolkit AppUI dependency", () => {
		const root = project()
		const library = appUi(root)
		execFileSync(process.execPath, [cli, "storybook", "--build"], {
			cwd: root,
			timeout: 8000,
			stdio: "pipe",
		})
		expect(
			JSON.parse(
				fs.readFileSync(path.join(library, "storybook-proof.json"), "utf8"),
			),
		).toEqual({ cwd: library })
	})
	it("rejects a missing project library instead of falling back to globally resolvable AppUI", () => {
		const root = project()
		const globalRoot = path.join(fixture, "global")
		const library = appUi(globalRoot)
		const env = {
			...process.env,
			NODE_PATH: path.join(globalRoot, "node_modules"),
		}
		const resolved = execFileSync(
			process.execPath,
			[
				"-e",
				"process.stdout.write(require.resolve('@gxp-dev/app-ui/package.json'))",
			],
			{ cwd: root, env, encoding: "utf8" },
		)
		expect(resolved).toBe(path.join(library, "package.json"))
		const result = spawnSync(process.execPath, [cli, "storybook", "--build"], {
			cwd: root,
			env,
			encoding: "utf8",
			timeout: 8000,
		})
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(
			"Could not find @gxp-dev/app-ui in this project's node_modules",
		)
		expect(fs.existsSync(path.join(library, "storybook-proof.json"))).toBe(
			false,
		)
	})
})
