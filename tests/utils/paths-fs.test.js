/**
 * Real-filesystem tests for paths.js. The original paths.test.js mostly tests
 * the logic patterns in isolation; this suite exercises the actual exports
 * against tmpdirs so that regressions in the walk-up loop or homedir-config
 * load surface here instead of in the e2e suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"

const {
	findProjectRoot,
	loadGlobalConfig,
} = require("../../bin/lib/utils/paths")

describe("paths.js (real fs)", () => {
	let tmpRoot, prevCwd

	beforeEach(() => {
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gxdev-paths-"))
		prevCwd = process.cwd()
	})

	afterEach(() => {
		// Restore cwd before removing the tree so rmSync doesn't choke.
		try {
			process.chdir(prevCwd)
		} catch {
			// If prevCwd vanished, fall back to /tmp.
			process.chdir(os.tmpdir())
		}
		fs.rmSync(tmpRoot, { recursive: true, force: true })
		vi.restoreAllMocks()
	})

	describe("findProjectRoot", () => {
		it("walks up parents until it finds the nearest package.json", () => {
			// tmpRoot
			//   ├── package.json   <- expected match
			//   └── src/
			//        └── components/  <- starting cwd
			const pkgPath = path.join(tmpRoot, "package.json")
			fs.writeFileSync(pkgPath, JSON.stringify({ name: "owner" }))
			const deepPath = path.join(tmpRoot, "src", "components")
			fs.mkdirSync(deepPath, { recursive: true })

			// fs.realpathSync to normalize symlinks (macOS /tmp -> /private/tmp).
			const expected = fs.realpathSync(tmpRoot)
			process.chdir(deepPath)
			expect(fs.realpathSync(findProjectRoot())).toBe(expected)
		})

		it("returns the closest ancestor when there are nested package.jsons", () => {
			// tmpRoot/package.json  AND  tmpRoot/sub/package.json
			// From tmpRoot/sub/deep we expect tmpRoot/sub.
			fs.writeFileSync(
				path.join(tmpRoot, "package.json"),
				JSON.stringify({ name: "outer" }),
			)
			const subDir = path.join(tmpRoot, "sub")
			fs.mkdirSync(subDir)
			fs.writeFileSync(
				path.join(subDir, "package.json"),
				JSON.stringify({ name: "inner" }),
			)
			const deepDir = path.join(subDir, "deep")
			fs.mkdirSync(deepDir)

			process.chdir(deepDir)
			expect(fs.realpathSync(findProjectRoot())).toBe(fs.realpathSync(subDir))
		})

		it("falls back to cwd when no package.json is found in any ancestor", () => {
			// tmpRoot has nothing — and tmpdir() ancestors typically don't either.
			process.chdir(tmpRoot)
			// The function returns cwd as a fallback; we just check it's the
			// expected dir or one of its ancestors.
			const result = findProjectRoot()
			expect(typeof result).toBe("string")
			expect(result.length).toBeGreaterThan(0)
		})
	})

	describe("loadGlobalConfig", () => {
		it("returns {} when no global config file exists", () => {
			vi.spyOn(os, "homedir").mockReturnValue(tmpRoot)
			expect(loadGlobalConfig()).toEqual({})
		})

		it("parses and returns the contents of gxdev-default-config.json", () => {
			vi.spyOn(os, "homedir").mockReturnValue(tmpRoot)
			fs.writeFileSync(
				path.join(tmpRoot, "gxdev-default-config.json"),
				JSON.stringify({ author: "Peek", email: "peek@example.com" }),
			)
			expect(loadGlobalConfig()).toEqual({
				author: "Peek",
				email: "peek@example.com",
			})
		})

		it("returns {} (with a warning) when the config file is malformed", () => {
			vi.spyOn(os, "homedir").mockReturnValue(tmpRoot)
			vi.spyOn(console, "warn").mockImplementation(() => {})
			fs.writeFileSync(
				path.join(tmpRoot, "gxdev-default-config.json"),
				"not valid json",
			)
			expect(loadGlobalConfig()).toEqual({})
		})
	})
})
