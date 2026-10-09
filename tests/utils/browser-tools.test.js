import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
const require = createRequire(import.meta.url)
const { resolveWebExt, VERSION } = require("../../scripts/web-ext.js")
const launcher = path.resolve("scripts/web-ext.js")
let root
beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "gxp browser ; spaces "))
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))
function installFixture(version = VERSION, bin = "bin.mjs") {
	const directory = path.join(root, "node_modules", "web-ext")
	fs.mkdirSync(directory, { recursive: true })
	fs.writeFileSync(
		path.join(directory, "package.json"),
		JSON.stringify({ name: "web-ext", version, bin: { "web-ext": bin } }),
	)
	fs.writeFileSync(
		path.join(directory, "bin.mjs"),
		"console.log(JSON.stringify(process.argv.slice(2))); process.exitCode = Number(process.env.FIXTURE_EXIT || 0)",
	)
}
function run(args = [], extra = {}) {
	return spawnSync(process.execPath, [launcher, ...args], {
		encoding: "utf8",
		env: { ...process.env, GXP_BROWSER_TOOLS_DIR: root, ...extra },
	})
}
describe("optional pinned Firefox tooling", () => {
	it("fails with explicit installation guidance and does not download", () => {
		const result = run(["build"])
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(`web-ext@${VERSION}`)
		expect(fs.readdirSync(root)).toEqual([])
	})
	it("passes all arguments literally to the locally installed CLI", () => {
		installFixture()
		const args = [
			"build",
			"--source-dir",
			"extension ; $(touch unwanted)",
			"--artifacts-dir",
			"output with spaces",
		]
		const result = run(args)
		expect(result.status).toBe(0)
		expect(JSON.parse(result.stdout)).toEqual(args)
	})
	it("preserves a tool's failure status", () => {
		installFixture()
		expect(run(["run"], { FIXTURE_EXIT: "7" }).status).toBe(7)
	})
	it("rejects a different tool version", () => {
		installFixture("1.0.0")
		expect(() => resolveWebExt({ GXP_BROWSER_TOOLS_DIR: root })).toThrow(
			`requires web-ext@${VERSION}`,
		)
	})
	it("rejects an executable path outside its package", () => {
		installFixture(VERSION, "../other.mjs")
		expect(() => resolveWebExt({ GXP_BROWSER_TOOLS_DIR: root })).toThrow(
			"Invalid local",
		)
	})
})
