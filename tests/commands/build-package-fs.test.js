import { afterEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync, spawnSync } from "node:child_process"
import { createRequire } from "node:module"

const loadModule = createRequire(import.meta.url)
const AdmZip = loadModule("adm-zip")
const temporaryPaths = []

afterEach(() => {
	for (const directory of temporaryPaths.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true })
	}
})

describe("build packaging with the installed archive library", () => {
	it("preserves manifest, compiled code and nested assets in a readable gxpapp", () => {
		const project = fs.mkdtempSync(path.join(os.tmpdir(), "gxdev-archive-"))
		temporaryPaths.push(project)
		fs.mkdirSync(path.join(project, "dist"))
		fs.mkdirSync(path.join(project, "src/assets/nested"), { recursive: true })
		fs.writeFileSync(
			path.join(project, "package.json"),
			JSON.stringify({ name: "archive-qa" }),
		)
		fs.writeFileSync(
			path.join(project, "app-manifest.json"),
			JSON.stringify({
				name: "Archive QA",
				asset_dir: "/src/assets/",
				appInstructionsFile: "instructions.md",
				defaultStylingFile: "styles.css",
				configurationFile: "config.json",
			}),
		)
		fs.writeFileSync(
			path.join(project, "dist/plugin.js"),
			"export const fixture = true",
		)
		fs.writeFileSync(
			path.join(project, "dist/plugin.css"),
			".fixture { color: red }",
		)
		fs.writeFileSync(
			path.join(project, "src/assets/nested/fixture.txt"),
			"synthetic asset",
		)
		fs.writeFileSync(path.join(project, "instructions.md"), "safe instructions")
		fs.writeFileSync(path.join(project, "styles.css"), ".safe {}")
		fs.writeFileSync(path.join(project, "config.json"), "{}")
		const commandPath = loadModule.resolve("../../bin/lib/commands/build.js")
		const shellPath = loadModule.resolve("../../bin/lib/utils/process.js")
		execFileSync(
			process.execPath,
			[
				"-e",
				`
			require(process.argv[1]).run = () => ({ code: 0 });
			require(process.argv[2]).buildCommand({}).catch(() => process.exit(1));
		`,
				shellPath,
				commandPath,
			],
			{ cwd: project, timeout: 10000 },
		)

		expect(
			fs
				.readdirSync(path.join(project, "dist"))
				.filter((name) => name.endsWith(".gxpapp")),
		).toEqual(["Archive-QA.gxpapp"])
		const archive = new AdmZip(path.join(project, "dist/Archive-QA.gxpapp"))
		expect(archive.readAsText("appInstructions.md")).toBe("safe instructions")
		expect(archive.readAsText("default-styling.css")).toBe(".safe {}")
		expect(archive.readAsText("configuration.json")).toBe("{}")
		expect(archive.readAsText("plugin.js")).toBe("export const fixture = true")
		expect(archive.readAsText("plugin.css")).toBe(".fixture { color: red }")
		expect(archive.readAsText("assets/nested/fixture.txt")).toBe(
			"synthetic asset",
		)
		expect(JSON.parse(archive.readAsText("app-manifest.json")).name).toBe(
			"Archive QA",
		)
	})
})

describe("packaging project boundaries", () => {
	it.each([
		"asset traversal",
		"recursive assets",
		"instruction traversal",
		"styling traversal",
		"configuration traversal",
		"asset symlink",
		"asset directory symlink",
		"instruction symlink",
		"compiled symlink",
		"output symlink",
		"manifest symlink",
	])("rejects %s without exporting or overwriting outside data", (scenario) => {
		const parent = fs.mkdtempSync(path.join(os.tmpdir(), "gxdev-boundary-"))
		temporaryPaths.push(parent)
		const project = path.join(parent, "project")
		const outside = path.join(parent, "private.txt")
		fs.mkdirSync(path.join(project, "dist"), { recursive: true })
		fs.mkdirSync(path.join(project, "src/assets"), { recursive: true })
		fs.writeFileSync(outside, "private fixture")
		fs.writeFileSync(
			path.join(project, "package.json"),
			JSON.stringify({ name: "boundary" }),
		)
		fs.writeFileSync(
			path.join(project, "dist/plugin.js"),
			"export const ok = true",
		)
		const manifest = { name: "boundary", asset_dir: "/src/assets/" }
		const traversal = {
			"instruction traversal": "appInstructionsFile",
			"styling traversal": "defaultStylingFile",
			"configuration traversal": "configurationFile",
		}
		if (traversal[scenario]) manifest[traversal[scenario]] = "../private.txt"
		if (scenario === "asset traversal") manifest.asset_dir = "../"
		if (scenario === "recursive assets") manifest.asset_dir = "."
		if (scenario === "asset symlink")
			fs.symlinkSync(outside, path.join(project, "src/assets/leak.txt"))
		if (scenario === "asset directory symlink") {
			fs.symlinkSync(parent, path.join(project, "linked-assets"), "dir")
			manifest.asset_dir = "linked-assets"
		}
		if (scenario === "instruction symlink") {
			fs.symlinkSync(outside, path.join(project, "instructions.md"))
			manifest.appInstructionsFile = "instructions.md"
		}
		if (scenario === "compiled symlink")
			fs.symlinkSync(outside, path.join(project, "dist/leak.js"))
		if (scenario === "output symlink")
			fs.symlinkSync(outside, path.join(project, "dist/boundary.gxpapp"))
		const manifestPath = path.join(project, "app-manifest.json")
		if (scenario === "manifest symlink") {
			fs.writeFileSync(
				path.join(parent, "manifest.json"),
				JSON.stringify(manifest),
			)
			fs.symlinkSync(path.join(parent, "manifest.json"), manifestPath)
		} else fs.writeFileSync(manifestPath, JSON.stringify(manifest))
		const result = spawnSync(
			process.execPath,
			[
				"-e",
				"require(process.argv[1]).run = () => ({ code: 0 }); require(process.argv[2]).buildCommand({}).catch(() => process.exit(1));",
				loadModule.resolve("../../bin/lib/utils/process.js"),
				loadModule.resolve("../../bin/lib/commands/build.js"),
			],
			{ cwd: project, encoding: "utf8", timeout: 10000 },
		)
		expect(result.error).toBeUndefined()
		expect(result.status).toBe(1)
		expect(result.stderr).toMatch(/Packaging path/)
		expect(fs.readFileSync(outside, "utf8")).toBe("private fixture")
		if (scenario !== "output symlink")
			expect(fs.existsSync(path.join(project, "dist/boundary.gxpapp"))).toBe(
				false,
			)
	})
})
