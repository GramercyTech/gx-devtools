import { afterEach, describe, expect, it } from "vitest"
import { createRequire } from "node:module"
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
