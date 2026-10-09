import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { createRequire } from "node:module"
const loadModule = createRequire(import.meta.url)
const shell = loadModule("../../bin/lib/utils/process.js")
const { installDependencies } = loadModule("../../bin/lib/utils/files.js")

describe("dependency installation", () => {
	beforeEach(() => vi.spyOn(console, "log").mockImplementation(() => {}))
	afterEach(() => vi.restoreAllMocks())
	it("fails initialization on an install error without reporting success", () => {
		const execute = vi.spyOn(shell, "npm").mockReturnValue({ code: 1 })
		expect(() => installDependencies("/tmp/qa-app")).toThrow(
			"installation failed",
		)
		expect(execute).toHaveBeenCalledTimes(1)
	})
	it("rejects a successful install whose lockfile cannot be cleanly installed", () => {
		const execute = vi
			.spyOn(shell, "npm")
			.mockReturnValueOnce({ code: 0 })
			.mockReturnValueOnce({ code: 1 })
		expect(() => installDependencies("/tmp/qa-app")).toThrow(
			"lockfile verification failed",
		)
		expect(execute.mock.calls[1][0]).toEqual([
			"ci",
			"--dry-run",
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
		])
	})
	it("runs both stages in the project directory without changing global cwd", () => {
		const cwd = process.cwd()
		const execute = vi.spyOn(shell, "npm").mockReturnValue({ code: 0 })
		installDependencies("/tmp/app with spaces")
		expect(execute).toHaveBeenCalledTimes(2)
		for (const call of execute.mock.calls)
			expect(call[1].cwd).toBe("/tmp/app with spaces")
		expect(process.cwd()).toBe(cwd)
	})
})
