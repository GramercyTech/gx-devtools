/**
 * Real-filesystem tests for bin/lib/utils/files.js
 *
 * The original files.test.js asserts logic snippets in isolation; this suite
 * exercises the actual exported functions against a per-test tmpdir so that
 * regressions in the real read/write paths surface here instead of only being
 * caught in the e2e CLI suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"

const {
	safeCopyFile,
	createPackageJson,
	updateAppManifest,
	ensureBaseFramework,
	updateExistingProject,
} = require("../../bin/lib/utils/files")
const {
	REQUIRED_DEPENDENCIES,
	REQUIRED_DEV_DEPENDENCIES,
	DEFAULT_SCRIPTS,
	BASE_FRAMEWORK,
} = require("../../bin/lib/constants")

function makeTmpDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "gxdev-files-test-"))
}

describe("files.js (real fs)", () => {
	let tmpDir

	beforeEach(() => {
		tmpDir = makeTmpDir()
		vi.spyOn(console, "log").mockImplementation(() => {})
		vi.spyOn(console, "warn").mockImplementation(() => {})
		vi.spyOn(console, "error").mockImplementation(() => {})
	})

	afterEach(() => {
		vi.restoreAllMocks()
		fs.rmSync(tmpDir, { recursive: true, force: true })
	})

	describe("safeCopyFile", () => {
		it("copies the file and creates missing parent directories", () => {
			const src = path.join(tmpDir, "src.txt")
			const dest = path.join(tmpDir, "nested", "deep", "dest.txt")
			fs.writeFileSync(src, "hello")

			safeCopyFile(src, dest, "test file")

			expect(fs.existsSync(dest)).toBe(true)
			expect(fs.readFileSync(dest, "utf-8")).toBe("hello")
		})

		it("does not overwrite an existing destination when overwrite=false", () => {
			const src = path.join(tmpDir, "src.txt")
			const dest = path.join(tmpDir, "dest.txt")
			fs.writeFileSync(src, "from src")
			fs.writeFileSync(dest, "existing content")

			safeCopyFile(src, dest, "test file", false)

			expect(fs.readFileSync(dest, "utf-8")).toBe("existing content")
		})

		it("overwrites an existing destination when overwrite=true", () => {
			const src = path.join(tmpDir, "src.txt")
			const dest = path.join(tmpDir, "dest.txt")
			fs.writeFileSync(src, "from src")
			fs.writeFileSync(dest, "stale content")

			safeCopyFile(src, dest, "test file", true)

			expect(fs.readFileSync(dest, "utf-8")).toBe("from src")
		})
	})

	describe("createPackageJson", () => {
		it("writes a package.json with the toolkit's required deps + scripts", () => {
			createPackageJson(tmpDir, "my-plugin", "My great plugin")

			const pkgPath = path.join(tmpDir, "package.json")
			expect(fs.existsSync(pkgPath)).toBe(true)
			const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))

			expect(pkg.name).toBe("my-plugin")
			expect(pkg.description).toBe("My great plugin")
			expect(pkg.type).toBe("module")
			expect(pkg.dependencies).toEqual(REQUIRED_DEPENDENCIES)
			expect(pkg.devDependencies).toEqual(REQUIRED_DEV_DEPENDENCIES)
			// DEFAULT_SCRIPTS should all be present (createPackageJson also adds
			// a "placeholder" override on top of them).
			for (const key of Object.keys(DEFAULT_SCRIPTS)) {
				expect(pkg.scripts).toHaveProperty(key)
			}
		})

		it("synthesizes a default description when none is supplied", () => {
			createPackageJson(tmpDir, "my-plugin", "")

			const pkg = JSON.parse(
				fs.readFileSync(path.join(tmpDir, "package.json"), "utf-8"),
			)
			expect(pkg.description).toBe("GxP Plugin: my-plugin")
		})
	})

	describe("updateAppManifest", () => {
		it("rewrites name/description, sets baseFramework, and updates welcome_text", () => {
			const manifestPath = path.join(tmpDir, "app-manifest.json")
			fs.writeFileSync(
				manifestPath,
				JSON.stringify({
					name: "stale-name",
					description: "stale",
					strings: { default: { welcome_text: "Welcome to stale" } },
					settings: { keep: "this" },
				}),
			)

			updateAppManifest(tmpDir, "fresh-plugin", "Fresh description")

			const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
			expect(manifest.name).toBe("fresh-plugin")
			expect(manifest.description).toBe("Fresh description")
			expect(manifest.baseFramework).toBe(BASE_FRAMEWORK)
			expect(manifest.strings.default.welcome_text).toBe(
				"Welcome to fresh-plugin",
			)
			// Untouched fields stay put.
			expect(manifest.settings.keep).toBe("this")
		})

		it("is a no-op when the manifest is missing", () => {
			// Should warn and return without throwing.
			expect(() => updateAppManifest(tmpDir, "x", "y")).not.toThrow()
			expect(fs.existsSync(path.join(tmpDir, "app-manifest.json"))).toBe(false)
		})
	})

	describe("ensureBaseFramework", () => {
		it("adds baseFramework when missing", () => {
			const manifestPath = path.join(tmpDir, "app-manifest.json")
			fs.writeFileSync(manifestPath, JSON.stringify({ name: "x" }))

			ensureBaseFramework(tmpDir)

			const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
			expect(manifest.baseFramework).toBe(BASE_FRAMEWORK)
		})

		it("upgrades a stale baseFramework value", () => {
			const manifestPath = path.join(tmpDir, "app-manifest.json")
			fs.writeFileSync(
				manifestPath,
				JSON.stringify({ name: "x", baseFramework: "tailwindcss@^3.0.0" }),
			)

			ensureBaseFramework(tmpDir)

			const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
			expect(manifest.baseFramework).toBe(BASE_FRAMEWORK)
		})

		it("is idempotent when baseFramework is already current", () => {
			const manifestPath = path.join(tmpDir, "app-manifest.json")
			const before = JSON.stringify(
				{ name: "x", baseFramework: BASE_FRAMEWORK },
				null,
				"\t",
			)
			fs.writeFileSync(manifestPath, before)
			const mtimeBefore = fs.statSync(manifestPath).mtimeMs

			ensureBaseFramework(tmpDir)

			// Function should exit before writing.
			expect(fs.statSync(manifestPath).mtimeMs).toBe(mtimeBefore)
			expect(fs.readFileSync(manifestPath, "utf-8")).toBe(before)
		})
	})

	describe("updateExistingProject", () => {
		it("returns false and writes nothing when package.json is absent", () => {
			expect(updateExistingProject(tmpDir)).toBe(false)
			expect(fs.existsSync(path.join(tmpDir, "package.json"))).toBe(false)
		})

		it("adds missing required deps + scripts and sets type=module", () => {
			const pkgPath = path.join(tmpDir, "package.json")
			fs.writeFileSync(pkgPath, JSON.stringify({ name: "x", version: "1.0.0" }))

			const updated = updateExistingProject(tmpDir)
			expect(updated).toBe(true)

			const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
			expect(pkg.type).toBe("module")
			for (const dep of Object.keys(REQUIRED_DEPENDENCIES)) {
				expect(pkg.dependencies).toHaveProperty(dep)
			}
			for (const dep of Object.keys(REQUIRED_DEV_DEPENDENCIES)) {
				expect(pkg.devDependencies).toHaveProperty(dep)
			}
			for (const script of Object.keys(DEFAULT_SCRIPTS)) {
				expect(pkg.scripts).toHaveProperty(script)
			}
		})

		it("upgrades dependency versions that don't match the toolkit", () => {
			const pkgPath = path.join(tmpDir, "package.json")
			// Use the first required dep with a deliberately stale version
			const [firstDep] = Object.keys(REQUIRED_DEPENDENCIES)
			fs.writeFileSync(
				pkgPath,
				JSON.stringify({
					name: "x",
					version: "1.0.0",
					type: "module",
					dependencies: { [firstDep]: "^0.0.1" },
				}),
			)

			updateExistingProject(tmpDir)

			const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
			expect(pkg.dependencies[firstDep]).toBe(REQUIRED_DEPENDENCIES[firstDep])
		})

		it("preserves the project's chosen package type (does not flip commonjs to module)", () => {
			const pkgPath = path.join(tmpDir, "package.json")
			fs.writeFileSync(
				pkgPath,
				JSON.stringify({ name: "x", version: "1.0.0", type: "commonjs" }),
			)

			updateExistingProject(tmpDir)

			const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
			expect(pkg.type).toBe("commonjs")
		})

		it("preserves an existing custom script under the same key", () => {
			const pkgPath = path.join(tmpDir, "package.json")
			fs.writeFileSync(
				pkgPath,
				JSON.stringify({
					name: "x",
					version: "1.0.0",
					type: "module",
					scripts: { dev: "my-custom-dev" },
				}),
			)

			updateExistingProject(tmpDir)

			const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
			expect(pkg.scripts.dev).toBe("my-custom-dev")
			// But missing toolkit scripts still get added.
			expect(pkg.scripts).toHaveProperty("build")
		})
	})
})
