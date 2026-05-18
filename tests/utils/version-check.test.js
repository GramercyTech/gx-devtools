/**
 * Tests for bin/lib/utils/version-check.js
 *
 * The version checker hits the npm registry once every 24h and caches the
 * result. We exercise the pure pieces (semver compare, banner formatting,
 * cached-info derivation) and the cache read/write path via a redirected
 * CACHE_FILE. The actual https call is not exercised — it's fire-and-forget
 * and we treat the network as out of scope for unit tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"

// version-check picks up the cache file path lazily from os.homedir(). The
// simplest, least-invasive way to redirect it during tests is to spy on
// os.homedir() and point it at a tmp dir.
function makeTmpHome() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "gxdev-version-home-"))
}

function freshRequire() {
	// Drop the cached version-check module so the path constants get
	// re-evaluated against the mocked os.homedir(). require.cache uses real
	// paths so we resolve relative to this file.
	const modPath = require.resolve("../../bin/lib/utils/version-check")
	delete require.cache[modPath]
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return require("../../bin/lib/utils/version-check")
}

describe("version-check", () => {
	let tmpHome
	let vc

	beforeEach(() => {
		tmpHome = makeTmpHome()
		vi.spyOn(os, "homedir").mockReturnValue(tmpHome)
		delete process.env.GXP_NO_VERSION_CHECK
		vc = freshRequire()
	})

	afterEach(() => {
		vi.restoreAllMocks()
		fs.rmSync(tmpHome, { recursive: true, force: true })
		// Clean up any exit handlers registerCliExitReminder may have added.
		process.removeAllListeners("exit")
	})

	describe("compareVersions", () => {
		it("returns 1 when the first version is higher", () => {
			expect(vc.compareVersions("2.0.0", "1.9.9")).toBe(1)
			expect(vc.compareVersions("1.2.3", "1.2.2")).toBe(1)
			expect(vc.compareVersions("1.10.0", "1.9.0")).toBe(1)
		})

		it("returns -1 when the first version is lower", () => {
			expect(vc.compareVersions("1.0.0", "1.0.1")).toBe(-1)
			expect(vc.compareVersions("1.9.9", "2.0.0")).toBe(-1)
		})

		it("returns 0 for equal versions", () => {
			expect(vc.compareVersions("1.2.3", "1.2.3")).toBe(0)
		})

		it("strips pre-release suffixes before comparing", () => {
			expect(vc.compareVersions("1.2.3-beta.1", "1.2.3")).toBe(0)
			expect(vc.compareVersions("1.2.3-rc.0", "1.2.4")).toBe(-1)
		})

		it("handles missing segments as zero", () => {
			expect(vc.compareVersions("1", "1.0.0")).toBe(0)
			expect(vc.compareVersions("1.2", "1.2.1")).toBe(-1)
		})
	})

	describe("getCachedUpdateInfo", () => {
		it("returns the installed version with latestVersion=null when no cache exists", () => {
			const info = vc.getCachedUpdateInfo()
			expect(info).not.toBeNull()
			expect(typeof info.currentVersion).toBe("string")
			expect(info.latestVersion).toBeNull()
			expect(info.updateAvailable).toBe(false)
		})

		it("flags updateAvailable when cached latest > installed", () => {
			fs.mkdirSync(path.join(tmpHome, ".gxp-dev"), { recursive: true })
			fs.writeFileSync(
				path.join(tmpHome, ".gxp-dev", "version-check.json"),
				JSON.stringify({
					packageName: "@gxp-dev/tools",
					latestVersion: "99999.0.0",
					lastCheckedAt: Date.now(),
				}),
			)

			const info = vc.getCachedUpdateInfo()
			expect(info.updateAvailable).toBe(true)
			expect(info.latestVersion).toBe("99999.0.0")
		})

		it("does NOT flag an update when cached latest <= installed", () => {
			fs.mkdirSync(path.join(tmpHome, ".gxp-dev"), { recursive: true })
			fs.writeFileSync(
				path.join(tmpHome, ".gxp-dev", "version-check.json"),
				JSON.stringify({
					packageName: "@gxp-dev/tools",
					latestVersion: "0.0.1",
					lastCheckedAt: Date.now(),
				}),
			)

			const info = vc.getCachedUpdateInfo()
			expect(info.updateAvailable).toBe(false)
		})

		it("returns null when GXP_NO_VERSION_CHECK=1 is set", () => {
			process.env.GXP_NO_VERSION_CHECK = "1"
			expect(vc.getCachedUpdateInfo()).toBeNull()
		})

		it("tolerates a corrupt cache file (treats it as no cache)", () => {
			fs.mkdirSync(path.join(tmpHome, ".gxp-dev"), { recursive: true })
			fs.writeFileSync(
				path.join(tmpHome, ".gxp-dev", "version-check.json"),
				"not json at all",
			)
			const info = vc.getCachedUpdateInfo()
			expect(info).not.toBeNull()
			expect(info.latestVersion).toBeNull()
			expect(info.updateAvailable).toBe(false)
		})
	})

	describe("formatCliReminder", () => {
		it("returns an empty string when no update is available", () => {
			expect(vc.formatCliReminder(null)).toBe("")
			expect(
				vc.formatCliReminder({
					updateAvailable: false,
					latestVersion: "1.0.0",
				}),
			).toBe("")
			expect(
				vc.formatCliReminder({ updateAvailable: true, latestVersion: null }),
			).toBe("")
		})

		it("renders the version delta and the recommended install command", () => {
			const out = vc.formatCliReminder({
				currentVersion: "1.0.0",
				latestVersion: "2.0.0",
				updateAvailable: true,
			})
			expect(out).toContain("1.0.0")
			expect(out).toContain("2.0.0")
			expect(out).toContain("npm i -g @gxp-dev/tools")
		})
	})

	describe("registerCliExitReminder", () => {
		it("is idempotent (only the first call adds a listener)", () => {
			const before = process.listenerCount("exit")
			vc.registerCliExitReminder()
			vc.registerCliExitReminder()
			vc.registerCliExitReminder()
			expect(process.listenerCount("exit")).toBe(before + 1)
		})

		it("does not register a listener when version checking is disabled", () => {
			process.env.GXP_NO_VERSION_CHECK = "1"
			// Reload module so cliReminderRegistered state resets.
			vc = freshRequire()
			const before = process.listenerCount("exit")
			vc.registerCliExitReminder()
			expect(process.listenerCount("exit")).toBe(before)
		})
	})
})
