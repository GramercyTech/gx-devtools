/**
 * End-to-end CLI smoke test for gxdev init / build / dev.
 *
 * Strategy:
 *   1. Pick a tmpdir.
 *   2. Run the local gxdev binary's `init <name> --yes` to scaffold a project
 *      (this also runs `npm install` to pull in vite, vue, etc. — the
 *      published @gxp-dev/tools tarball is fetched as well, but every gxdev
 *      invocation we make uses GXDEV_USE_GLOBAL=1 so the runtime/template
 *      files come from THIS checkout, not whatever's published).
 *   3. Run `gxdev build` and verify a `.gxpapp` lands in dist/.
 *   4. Boot `gxdev dev --no-https`, poll for HTTP 200 on the dev port, then
 *      SIGTERM and verify a clean shutdown.
 *
 * These tests are gated by RUN_CLI_E2E=1 so a casual `npm test` stays fast.
 * In CI they run via the `e2e` job in .github/workflows/ci.yml and as part of
 * release.yml's pre-publish verification.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { execSync, spawn, spawnSync } from "child_process"
import fs from "fs"
import http from "http"
import net from "net"
import os from "os"
import path from "path"

const ENABLED =
	process.env.RUN_CLI_E2E === "1" || process.env.RUN_CLI_E2E === "true"

const TOOLKIT_ROOT = path.resolve(__dirname, "..", "..")
const GXDEV_BIN = path.join(TOOLKIT_ROOT, "bin", "gx-devtools.js")
const PROJECT_NAME = "e2e-fixture-plugin"

let fixtureDir = ""
let projectDir = ""

/** Pick a free TCP port for the dev server so we don't collide with anything. */
function getFreePort() {
	return new Promise((resolve, reject) => {
		const srv = net.createServer()
		srv.unref()
		srv.on("error", reject)
		srv.listen(0, () => {
			const { port } = srv.address()
			srv.close(() => resolve(port))
		})
	})
}

/**
 * Poll http://localhost:<port>/ until a request returns a non-5xx status or
 * the deadline is reached. Throws on timeout. Resolves with the status code
 * that came back — Vite's dev server returns 200 for / once it's ready.
 */
async function waitForServer(port, { timeoutMs = 120_000 } = {}) {
	const deadline = Date.now() + timeoutMs
	let lastError = null
	while (Date.now() < deadline) {
		try {
			const status = await new Promise((resolve, reject) => {
				const req = http.get({ host: "127.0.0.1", port, path: "/" }, (res) => {
					res.resume()
					resolve(res.statusCode || 0)
				})
				req.on("error", reject)
				req.setTimeout(3000, () => req.destroy(new Error("request timeout")))
			})
			if (status > 0 && status < 500) {
				return status
			}
		} catch (err) {
			lastError = err
		}
		await new Promise((r) => setTimeout(r, 500))
	}
	throw new Error(
		`dev server never came up on :${port} (last error: ${lastError?.message ?? "none"})`,
	)
}

beforeAll(async () => {
	if (!ENABLED) {
		return
	}

	fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "gxdev-e2e-"))
	projectDir = path.join(fixtureDir, PROJECT_NAME)

	// gxdev init expects to operate from the parent dir and create a
	// subdirectory matching the project name. --yes skips prompts and skips
	// launching a dev server, but DOES still run `npm install` internally.
	// We forward GXDEV_USE_GLOBAL so the local toolkit (not whatever's on
	// npm) drives every subsequent invocation.
	const initResult = spawnSync(
		process.execPath,
		[GXDEV_BIN, "init", PROJECT_NAME, "--yes"],
		{
			cwd: fixtureDir,
			env: { ...process.env, GXDEV_USE_GLOBAL: "true" },
			stdio: "pipe",
			encoding: "utf-8",
		},
	)

	if (initResult.status !== 0) {
		// Surface the failure in the test runner with the actual stderr so we
		// can debug from CI logs without sshing in.
		throw new Error(
			`gxdev init failed (exit ${initResult.status}):\n` +
				`STDOUT:\n${initResult.stdout}\n` +
				`STDERR:\n${initResult.stderr}`,
		)
	}
}, 600_000)

afterAll(() => {
	if (fixtureDir && fs.existsSync(fixtureDir)) {
		try {
			execSync(`rm -rf "${fixtureDir}"`, { stdio: "ignore" })
		} catch {
			// Best-effort cleanup — don't fail the suite if the shell remove fails
		}
	}
})

describe.runIf(ENABLED)("gxdev e2e", () => {
	describe("gxdev init", () => {
		it("creates the project directory", () => {
			expect(fs.existsSync(projectDir)).toBe(true)
		})

		it("scaffolds package.json with project name + required scripts", () => {
			const pkg = JSON.parse(
				fs.readFileSync(path.join(projectDir, "package.json"), "utf-8"),
			)
			expect(pkg.name).toBe(PROJECT_NAME)
			expect(pkg.scripts).toHaveProperty("dev")
			expect(pkg.scripts).toHaveProperty("build")
			expect(pkg.scripts).toHaveProperty("dev-http")
			expect(pkg.dependencies).toHaveProperty("@gxp-dev/app-ui")
			expect(pkg.devDependencies).toHaveProperty("@gxp-dev/tools")
		})

		it("scaffolds the template entry files (Plugin.vue, layouts, manifest)", () => {
			const required = [
				"src/Plugin.vue",
				"theme-layouts/SystemLayout.vue",
				"theme-layouts/PrivateLayout.vue",
				"theme-layouts/PublicLayout.vue",
				"app-manifest.json",
				".env.example",
			]
			for (const rel of required) {
				expect(fs.existsSync(path.join(projectDir, rel))).toBe(true)
			}
		})

		it("writes a manifest with the toolkit's pinned baseFramework", () => {
			const manifest = JSON.parse(
				fs.readFileSync(path.join(projectDir, "app-manifest.json"), "utf-8"),
			)
			expect(manifest.name).toBe(PROJECT_NAME)
			expect(manifest.baseFramework).toMatch(/^tailwindcss@/)
		})

		it("populated node_modules during install (vite is on disk)", () => {
			// We don't assert a specific version — just that npm install ran and
			// dropped the bins we rely on for build/dev.
			expect(
				fs.existsSync(path.join(projectDir, "node_modules", ".bin", "vite")),
			).toBe(true)
		})
	})

	describe("gxdev build", () => {
		it("produces a .gxpapp file in dist/", () => {
			const buildResult = spawnSync(process.execPath, [GXDEV_BIN, "build"], {
				cwd: projectDir,
				env: { ...process.env, GXDEV_USE_GLOBAL: "true" },
				stdio: "pipe",
				encoding: "utf-8",
				timeout: 240_000,
			})

			if (buildResult.status !== 0) {
				throw new Error(
					`gxdev build failed (exit ${buildResult.status}):\n` +
						`STDOUT:\n${buildResult.stdout}\n` +
						`STDERR:\n${buildResult.stderr}`,
				)
			}

			const distDir = path.join(projectDir, "dist")
			expect(fs.existsSync(distDir)).toBe(true)

			const gxpapps = fs
				.readdirSync(distDir)
				.filter((f) => f.endsWith(".gxpapp"))
			expect(gxpapps.length).toBeGreaterThan(0)

			// The package should be non-trivial — at minimum the entry JS plus
			// the manifest. 1 KB is a safe floor.
			const pkgPath = path.join(distDir, gxpapps[0])
			expect(fs.statSync(pkgPath).size).toBeGreaterThan(1024)
		})
	})

	describe("gxdev dev", () => {
		let devProcess

		it("boots the dev server, serves HTTP, and shuts down on SIGTERM", async () => {
			// Allocate a free port and pass it through gxdev's --port flag so
			// the test can't collide with anything else on a dev machine. (The
			// `--port` fix in dev.js relies on the flag being forwarded to vite
			// CLI; if that regresses this test starts failing.)
			const port = await getFreePort()

			devProcess = spawn(
				process.execPath,
				[GXDEV_BIN, "dev", "--no-https", "--no-socket", "--port", String(port)],
				{
					cwd: projectDir,
					env: { ...process.env, GXDEV_USE_GLOBAL: "true" },
					stdio: "pipe",
				},
			)

			// Capture output for failure diagnostics.
			let stdoutBuf = ""
			let stderrBuf = ""
			devProcess.stdout.on("data", (chunk) => {
				stdoutBuf += chunk.toString()
			})
			devProcess.stderr.on("data", (chunk) => {
				stderrBuf += chunk.toString()
			})

			let exited = false
			devProcess.on("exit", () => {
				exited = true
			})

			try {
				await waitForServer(port, { timeoutMs: 120_000 })
			} catch (err) {
				throw new Error(
					`${err.message}\n` +
						`STDOUT:\n${stdoutBuf.slice(-4000)}\n` +
						`STDERR:\n${stderrBuf.slice(-4000)}`,
				)
			}

			// Clean shutdown — SIGTERM and wait up to 10s for exit.
			devProcess.kill("SIGTERM")
			const exitedCleanly = await new Promise((resolve) => {
				const timer = setTimeout(() => {
					devProcess.kill("SIGKILL")
					resolve(false)
				}, 10_000)
				devProcess.on("exit", () => {
					clearTimeout(timer)
					resolve(true)
				})
				if (exited) {
					clearTimeout(timer)
					resolve(true)
				}
			})

			expect(exitedCleanly).toBe(true)
		}, 180_000)
	})
})

// Always include at least one passing case for runs where RUN_CLI_E2E is unset,
// so the test file isn't considered empty (vitest treats zero-test files as a
// failure unless you flip a config flag — easier to just include a sentinel).
describe.skipIf(ENABLED)("gxdev e2e (disabled)", () => {
	it("is skipped because RUN_CLI_E2E is not set", () => {
		expect(ENABLED).toBe(false)
	})
})
