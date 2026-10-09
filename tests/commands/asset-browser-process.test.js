import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
const require = createRequire(import.meta.url)
const AdmZip = require("adm-zip")
const assets = require.resolve("../../bin/lib/commands/assets.js")
const pack = require.resolve("../../scripts/pack-chrome.js")
let root
beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "gxp assets ; space "))
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))
describe("asset and browser packaging processes", () => {
	it("passes ImageMagick text literally without evaluating shell expressions", () => {
		fs.writeFileSync(path.join(root, "package.json"), "{}")
		fs.writeFileSync(
			path.join(root, "magick"),
			`#!${process.execPath}\nrequire('node:fs').writeFileSync('arguments.json',JSON.stringify(process.argv.slice(2)))`,
			{ mode: 0o755 },
		)
		const text = 'Hello "quoted" $(touch injected); `touch injected`'
		const result = spawnSync(
			process.execPath,
			[
				"-e",
				"require(process.argv[1]).assetsCommand(JSON.parse(process.argv[2])).catch(e=>{console.error(e);process.exit(1)})",
				assets,
				JSON.stringify({
					action: "generate",
					text,
					size: "100x100",
					color: "#112233",
				}),
			],
			{ cwd: root, env: { ...process.env, PATH: root }, encoding: "utf8" },
		)
		expect(result.status, result.stderr).toBe(0)
		const args = JSON.parse(fs.readFileSync(path.join(root, "arguments.json")))
		expect(args.slice(-2)).toEqual([
			text,
			path.join(fs.realpathSync(root), "dev-assets/images/placeholder.png"),
		])
		expect(fs.existsSync(path.join(root, "injected"))).toBe(false)
	})
	it("creates a real Chrome zip with spaces and metacharacters in paths", () => {
		const source = path.join(root, "extension ; source")
		fs.mkdirSync(source)
		fs.writeFileSync(
			path.join(source, "manifest.json"),
			JSON.stringify({ version: "1.2.3" }),
		)
		fs.writeFileSync(path.join(source, "popup.js"), "console.log('fixture')")
		fs.writeFileSync(path.join(source, ".DS_Store"), "exclude")
		const output = path.join(root, "output ; literal")
		const result = spawnSync(process.execPath, [pack], {
			cwd: root,
			env: {
				...process.env,
				CHROME_EXTENSION_PATH: source,
				CHROME_BUILD_OUTPUT: output,
			},
			encoding: "utf8",
		})
		expect(result.status, result.stderr).toBe(0)
		const zip = new AdmZip(path.join(output, "gx-chrome-extension-v1.2.3.zip"))
		expect(
			zip
				.getEntries()
				.map((entry) => entry.entryName)
				.sort(),
		).toEqual(["manifest.json", "popup.js"])
	})
	it("rejects path characters in the archive version before creating a zip", () => {
		fs.writeFileSync(
			path.join(root, "manifest.json"),
			JSON.stringify({ version: "../../outside" }),
		)
		const result = spawnSync(process.execPath, [pack], {
			env: {
				...process.env,
				CHROME_EXTENSION_PATH: root,
				CHROME_BUILD_OUTPUT: path.join(root, "dist"),
			},
			encoding: "utf8",
		})
		expect(result.status).not.toBe(0)
		expect(result.stderr).toContain("Invalid Chrome extension version")
	})
})
