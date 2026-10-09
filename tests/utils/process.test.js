import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createRequire } from "node:module"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
const require = createRequire(import.meta.url)
const commands = require("../../bin/lib/utils/process.js")
let root
beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "gxp commands ; spaces "))
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))
describe("argument-array process execution", () => {
	it("passes shell metacharacters as literal arguments", () => {
		const values = [
			"a b",
			"; exit 99",
			"$(touch injected)",
			"`touch injected`",
			'"quoted"',
		]
		const result = commands.run(
			process.execPath,
			["-e", "console.log(JSON.stringify(process.argv.slice(1)))", ...values],
			{ silent: true, cwd: root },
		)
		expect(result.code).toBe(0)
		expect(JSON.parse(result.stdout)).toEqual(values)
		expect(fs.readdirSync(root)).toEqual([])
	})
	it("propagates nonzero and missing-command failures", () => {
		expect(
			commands.run(process.execPath, ["-e", "process.exit(7)"], {
				silent: true,
			}).code,
		).toBe(7)
		const failed = commands.run(path.join(root, "missing"), [], {
			silent: true,
		})
		expect(failed.code).toBe(1)
		expect(failed.stderr).toContain("ENOENT")
	})
	it("finds executables but rejects ordinary files and directories", () => {
		fs.writeFileSync(path.join(root, "probe"), "", { mode: 0o755 })
		fs.writeFileSync(path.join(root, "plain"), "", { mode: 0o644 })
		fs.mkdirSync(path.join(root, "directory"))
		expect(commands.which("probe", { PATH: root })).toBe(
			path.join(root, "probe"),
		)
		expect(commands.which("plain", { PATH: root })).toBeNull()
		expect(commands.which("directory", { PATH: root })).toBeNull()
	})
	it("installs an empty fixture and verifies its lockfile using npm's JS entrypoint", () => {
		fs.writeFileSync(
			path.join(root, "package.json"),
			JSON.stringify({
				name: "gxp-process-qa",
				version: "1.0.0",
				private: true,
			}),
		)
		const options = { cwd: root, silent: true }
		expect(
			commands.npm(
				["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline"],
				options,
			).code,
		).toBe(0)
		expect(
			commands.npm(
				[
					"ci",
					"--dry-run",
					"--ignore-scripts",
					"--no-audit",
					"--no-fund",
					"--offline",
				],
				options,
			).code,
		).toBe(0)
		expect(fs.existsSync(path.join(root, "package-lock.json"))).toBe(true)
	})
})
