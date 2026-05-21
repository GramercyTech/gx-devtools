/**
 * Tests for the `gxdev test` command.
 *
 * Covers vitest resolution (project → toolkit → not-found) and the
 * NODE_PATH handoff that lets a toolkit-resolved vitest find happy-dom
 * even when the project's node_modules is empty.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"
import { EventEmitter } from "events"

const testCmd = require("../../bin/lib/commands/test")
const paths = require("../../bin/lib/utils/paths")

function makeFakeChild() {
	const child = new EventEmitter()
	child.kill = vi.fn()
	return child
}

describe("test command — resolveVitest", () => {
	let tmpRoot, prevCwd

	beforeEach(() => {
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gxdev-test-"))
		prevCwd = process.cwd()
	})

	afterEach(() => {
		try {
			process.chdir(prevCwd)
		} catch {
			process.chdir(os.tmpdir())
		}
		fs.rmSync(tmpRoot, { recursive: true, force: true })
		vi.restoreAllMocks()
	})

	function makeVitestBin(parentDir) {
		const binDir = path.join(parentDir, "node_modules", ".bin")
		fs.mkdirSync(binDir, { recursive: true })
		const binPath = path.join(binDir, "vitest")
		fs.writeFileSync(binPath, "#!/bin/sh\nexit 0\n", { mode: 0o755 })
		return binPath
	}

	it("uses the project's vitest when present and reports fromToolkit=false", () => {
		fs.writeFileSync(path.join(tmpRoot, "package.json"), "{}")
		const projectBin = makeVitestBin(tmpRoot)
		const toolkitDir = path.join(tmpRoot, "toolkit")
		fs.mkdirSync(toolkitDir, { recursive: true })
		makeVitestBin(toolkitDir)

		process.chdir(tmpRoot)
		vi.spyOn(paths, "resolveGxPaths").mockReturnValue({
			packageRoot: toolkitDir,
		})

		const result = testCmd.resolveVitest()
		expect(fs.realpathSync(result.binary)).toBe(fs.realpathSync(projectBin))
		expect(result.fromToolkit).toBe(false)
	})

	it("falls back to the toolkit's vitest and reports fromToolkit=true", () => {
		fs.writeFileSync(path.join(tmpRoot, "package.json"), "{}")
		const toolkitDir = path.join(tmpRoot, "toolkit")
		fs.mkdirSync(toolkitDir, { recursive: true })
		const toolkitBin = makeVitestBin(toolkitDir)

		process.chdir(tmpRoot)
		vi.spyOn(paths, "resolveGxPaths").mockReturnValue({
			packageRoot: toolkitDir,
		})

		const result = testCmd.resolveVitest()
		expect(fs.realpathSync(result.binary)).toBe(fs.realpathSync(toolkitBin))
		expect(result.fromToolkit).toBe(true)
	})
})

describe("test command — testCommand spawn behaviour", () => {
	let exitSpy, errorSpy, originalArgv

	beforeEach(() => {
		exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {})
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
		originalArgv = process.argv
	})

	afterEach(() => {
		process.argv = originalArgv
		testCmd.setSpawnForTesting(null)
		vi.restoreAllMocks()
	})

	it("defaults to `vitest run --passWithNoTests` when no args are passed", async () => {
		const spawnMock = vi.fn(() => makeFakeChild())
		testCmd.setSpawnForTesting(spawnMock)

		vi.spyOn(testCmd, "resolveVitest").mockReturnValue({
			binary: "/fake/vitest",
			fromToolkit: false,
		})

		process.argv = ["node", "/path/to/gxdev", "test"]
		await testCmd.testCommand({ _: ["test"] })

		const [target, argList] = spawnMock.mock.calls[0]
		expect(target).toBe("/fake/vitest")
		expect(argList).toEqual(["run", "--passWithNoTests"])
	})

	it("switches to watch mode (drops `run`) when --watch is passed", async () => {
		const spawnMock = vi.fn(() => makeFakeChild())
		testCmd.setSpawnForTesting(spawnMock)

		vi.spyOn(testCmd, "resolveVitest").mockReturnValue({
			binary: "/fake/vitest",
			fromToolkit: false,
		})

		process.argv = ["node", "/path/to/gxdev", "test", "--watch"]
		await testCmd.testCommand({ _: ["test"], watch: true })

		const [, argList] = spawnMock.mock.calls[0]
		expect(argList).toEqual([])
	})

	it("forwards extra args (--filter foo, paths, etc.) to vitest", async () => {
		const spawnMock = vi.fn(() => makeFakeChild())
		testCmd.setSpawnForTesting(spawnMock)

		vi.spyOn(testCmd, "resolveVitest").mockReturnValue({
			binary: "/fake/vitest",
			fromToolkit: false,
		})

		process.argv = [
			"node",
			"/path/to/gxdev",
			"test",
			"--reporter",
			"verbose",
			"src/foo.test.js",
		]
		await testCmd.testCommand({ _: ["test"] })

		const [, argList] = spawnMock.mock.calls[0]
		expect(argList).toEqual([
			"run",
			"--passWithNoTests",
			"--reporter",
			"verbose",
			"src/foo.test.js",
		])
	})

	it("sets NODE_PATH to the toolkit's node_modules when vitest came from the toolkit", async () => {
		const spawnMock = vi.fn(() => makeFakeChild())
		testCmd.setSpawnForTesting(spawnMock)

		vi.spyOn(testCmd, "resolveVitest").mockReturnValue({
			binary: "/toolkit/node_modules/.bin/vitest",
			fromToolkit: true,
		})
		vi.spyOn(paths, "resolveGxPaths").mockReturnValue({
			packageRoot: "/toolkit",
		})

		// Clear inherited NODE_PATH so we can assert the exact set value.
		const originalNodePath = process.env.NODE_PATH
		delete process.env.NODE_PATH

		process.argv = ["node", "/path/to/gxdev", "test"]
		try {
			await testCmd.testCommand({ _: ["test"] })
		} finally {
			if (originalNodePath !== undefined) {
				process.env.NODE_PATH = originalNodePath
			}
		}

		const [, , spawnOpts] = spawnMock.mock.calls[0]
		expect(spawnOpts.env.NODE_PATH).toBe(path.join("/toolkit", "node_modules"))
	})

	it("does NOT override NODE_PATH when using the project's local vitest", async () => {
		const spawnMock = vi.fn(() => makeFakeChild())
		testCmd.setSpawnForTesting(spawnMock)

		vi.spyOn(testCmd, "resolveVitest").mockReturnValue({
			binary: "/project/node_modules/.bin/vitest",
			fromToolkit: false,
		})

		const originalNodePath = process.env.NODE_PATH
		process.env.NODE_PATH = "/some/preset/path"

		process.argv = ["node", "/path/to/gxdev", "test"]
		try {
			await testCmd.testCommand({ _: ["test"] })
		} finally {
			if (originalNodePath !== undefined) {
				process.env.NODE_PATH = originalNodePath
			} else {
				delete process.env.NODE_PATH
			}
		}

		const [, , spawnOpts] = spawnMock.mock.calls[0]
		expect(spawnOpts.env.NODE_PATH).toBe("/some/preset/path")
	})

	it("exits with code 127 when vitest cannot be resolved anywhere", async () => {
		vi.spyOn(testCmd, "resolveVitest").mockReturnValue({
			binary: null,
			fromToolkit: false,
		})

		process.argv = ["node", "/path/to/gxdev", "test"]
		await testCmd.testCommand({ _: ["test"] })

		expect(exitSpy).toHaveBeenCalledWith(127)
		expect(errorSpy).toHaveBeenCalled()
	})
})
