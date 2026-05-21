/**
 * Tests for the `gxdev exec` command.
 *
 * The resolveBinary path is exercised against a real tmpdir so the lookup
 * order (project node_modules → toolkit node_modules → PATH) is the actual
 * fs walk that production runs, not a mock. The spawn arg-forwarding is
 * covered with the setSpawnForTesting seam.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"
import { EventEmitter } from "events"

const exec = require("../../bin/lib/commands/exec")
const paths = require("../../bin/lib/utils/paths")

function makeFakeChild() {
	const child = new EventEmitter()
	child.kill = vi.fn()
	return child
}

describe("exec command — resolveBinary", () => {
	let tmpRoot, prevCwd

	beforeEach(() => {
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gxdev-exec-"))
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

	function makeBin(parentDir, name) {
		const binDir = path.join(parentDir, "node_modules", ".bin")
		fs.mkdirSync(binDir, { recursive: true })
		const binPath = path.join(binDir, name)
		fs.writeFileSync(binPath, "#!/bin/sh\nexit 0\n", { mode: 0o755 })
		return binPath
	}

	it("prefers the project's node_modules/.bin when present", () => {
		// Layout:
		//   tmpRoot/
		//     package.json
		//     node_modules/.bin/prettier   <- project copy (expected)
		//   tmpRoot/toolkit/
		//     node_modules/.bin/prettier   <- toolkit copy
		fs.writeFileSync(path.join(tmpRoot, "package.json"), "{}")
		const projectBin = makeBin(tmpRoot, "prettier")
		const toolkitDir = path.join(tmpRoot, "toolkit")
		fs.mkdirSync(toolkitDir, { recursive: true })
		makeBin(toolkitDir, "prettier")

		process.chdir(tmpRoot)
		vi.spyOn(paths, "resolveGxPaths").mockReturnValue({
			packageRoot: toolkitDir,
		})

		expect(fs.realpathSync(exec.resolveBinary("prettier"))).toBe(
			fs.realpathSync(projectBin),
		)
	})

	it("falls back to the toolkit's node_modules/.bin when the project has no copy", () => {
		fs.writeFileSync(path.join(tmpRoot, "package.json"), "{}")
		const toolkitDir = path.join(tmpRoot, "toolkit")
		fs.mkdirSync(toolkitDir, { recursive: true })
		const toolkitBin = makeBin(toolkitDir, "eslint")

		process.chdir(tmpRoot)
		vi.spyOn(paths, "resolveGxPaths").mockReturnValue({
			packageRoot: toolkitDir,
		})

		expect(fs.realpathSync(exec.resolveBinary("eslint"))).toBe(
			fs.realpathSync(toolkitBin),
		)
	})

	it("returns null when neither location has the binary (caller defers to PATH)", () => {
		fs.writeFileSync(path.join(tmpRoot, "package.json"), "{}")
		const toolkitDir = path.join(tmpRoot, "toolkit")
		fs.mkdirSync(toolkitDir, { recursive: true })

		process.chdir(tmpRoot)
		vi.spyOn(paths, "resolveGxPaths").mockReturnValue({
			packageRoot: toolkitDir,
		})

		expect(exec.resolveBinary("does-not-exist-xyz")).toBeNull()
	})
})

describe("exec command — execCommand spawn behaviour", () => {
	let exitSpy, errorSpy, originalArgv

	beforeEach(() => {
		exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {})
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
		originalArgv = process.argv
	})

	afterEach(() => {
		process.argv = originalArgv
		exec.setSpawnForTesting(null)
		vi.restoreAllMocks()
	})

	it("forwards args after `exec <tool>` verbatim to the spawned binary", async () => {
		const spawnMock = vi.fn(() => makeFakeChild())
		exec.setSpawnForTesting(spawnMock)

		// Pretend the user ran: gxdev exec prettier --write --ignore-unknown foo.js
		process.argv = [
			"node",
			"/path/to/gxdev",
			"exec",
			"prettier",
			"--write",
			"--ignore-unknown",
			"foo.js",
		]

		// Force resolveBinary to return null so the test doesn't depend on
		// the host filesystem — we only care that the args are forwarded.
		vi.spyOn(exec, "resolveBinary").mockReturnValue(null)

		await exec.execCommand({ _: ["exec", "prettier"], tool: "prettier" })

		expect(spawnMock).toHaveBeenCalledTimes(1)
		const [target, argList] = spawnMock.mock.calls[0]
		expect(target).toBe("prettier")
		expect(argList).toEqual(["--write", "--ignore-unknown", "foo.js"])
	})

	it("exits with code 2 and prints usage when no tool is provided", async () => {
		process.argv = ["node", "/path/to/gxdev", "exec"]
		await exec.execCommand({ _: ["exec"] })

		expect(exitSpy).toHaveBeenCalledWith(2)
		expect(errorSpy).toHaveBeenCalled()
		const msg = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n")
		expect(msg).toMatch(/Usage: gxdev exec/)
	})
})
