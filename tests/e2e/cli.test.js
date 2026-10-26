/**
 * End-to-end CLI smoke test for gxdev init / build / dev.
 *
 * Strategy: pack this checkout and substitute its exact archive immediately
 * before the real init npm install. Optional local AppUI archive substitution
 * proves the unpublished AppUI candidate without changing production gxdev.
 * Build/dev/test run the installed local toolkit with global fallback disabled.
 * This proves local packed candidates, not unpublished registry selection.
 *
 * These tests are gated by RUN_CLI_E2E=1 so a casual `npm test` stays fast.
 * In CI they run via the `e2e` job in .github/workflows/ci.yml and as part of
 * release.yml's pre-publish verification.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { spawn, spawnSync } from "child_process"
import { createRequire } from "node:module"
import { createHash } from "node:crypto"
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
let localGxdev = ""
let installReceipt = ""
let candidateDigest = ""
const require = createRequire(import.meta.url)
const { npmInvocation } = require("../../bin/lib/utils/process")
function localEnvironment() {
	const env = {}
	for (const key of [
		"PATH",
		"HOME",
		"USER",
		"LOGNAME",
		"TMPDIR",
		"TEMP",
		"TMP",
		"SystemRoot",
		"CI",
		"npm_config_cache",
	])
		if (process.env[key]) env[key] = process.env[key]
	env.npm_config_registry = "https://registry.npmjs.org"
	env.npm_config_userconfig = path.join(fixtureDir, "empty-user.npmrc")
	env.npm_config_globalconfig = path.join(fixtureDir, "empty-global.npmrc")
	return env
}

function npmResult(args, cwd = projectDir) {
	const invocation = npmInvocation(args, localEnvironment())
	return spawnSync(invocation.command, invocation.args, {
		cwd,
		env: localEnvironment(),
		encoding: "utf8",
		timeout: 300000,
		maxBuffer: 4 * 1024 * 1024,
	})
}

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
	fs.writeFileSync(path.join(fixtureDir, "empty-user.npmrc"), "")
	fs.writeFileSync(path.join(fixtureDir, "empty-global.npmrc"), "")

	const pack = npmResult(
		["pack", "--ignore-scripts", "--json", "--pack-destination", fixtureDir],
		TOOLKIT_ROOT,
	)
	if (pack.status !== 0) throw new Error("Exact local toolkit packing failed")
	const packed = JSON.parse(pack.stdout)
	const entry = Array.isArray(packed) ? packed[0] : packed["@gxp-dev/tools"]
	if (
		entry?.name !== "@gxp-dev/tools" ||
		entry.version !== "2.1.44" ||
		path.basename(entry.filename) !== entry.filename
	)
		throw new Error("Unexpected packed toolkit identity")
	const archive = path.join(fixtureDir, entry.filename)
	candidateDigest = createHash("sha256")
		.update(fs.readFileSync(archive))
		.digest("hex")
	const archives = {
		"@gxp-dev/tools": { path: archive, sha256: candidateDigest },
	}
	if (process.env.GXDEV_E2E_APPUI_TARBALL) {
		const file = path.resolve(process.env.GXDEV_E2E_APPUI_TARBALL)
		const digest = createHash("sha256")
			.update(fs.readFileSync(file))
			.digest("hex")
		if (digest !== process.env.GXDEV_E2E_APPUI_SHA256)
			throw new Error("AppUI candidate archive hash mismatch")
		archives["@gxp-dev/app-ui"] = { path: file, sha256: digest }
	}
	installReceipt = path.join(fixtureDir, "install-receipt.json")
	const config = path.join(fixtureDir, "install-config.json")
	fs.writeFileSync(
		config,
		JSON.stringify({ project: projectDir, archives, receipt: installReceipt }),
	)
	const initResult = spawnSync(
		process.execPath,
		[
			"--require",
			path.join(TOOLKIT_ROOT, "tests/e2e/candidate-install.cjs"),
			GXDEV_BIN,
			"init",
			PROJECT_NAME,
			"--yes",
		],
		{
			cwd: fixtureDir,
			env: { ...localEnvironment(), GXDEV_E2E_INSTALL_CONFIG: config },
			stdio: "pipe",
			encoding: "utf8",
			timeout: 600000,
			maxBuffer: 4 * 1024 * 1024,
		},
	)
	localGxdev = path.join(
		projectDir,
		"node_modules/@gxp-dev/tools/bin/gx-devtools.js",
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
		if (process.env.GXDEV_E2E_RETAIN_FIXTURE === "1") {
			fs.writeFileSync(process.env.GXDEV_E2E_FIXTURE_POINTER, fixtureDir)
			return
		}
		try {
			fs.rmSync(fixtureDir, { recursive: true, force: true })
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

	it("runs a Vue component test with the shipped config after clean install", () => {
		const env = localEnvironment()
		const npm = process.platform === "win32" ? "npm.cmd" : "npm"
		const install = spawnSync(npm, ["ci", "--no-audit", "--no-fund"], {
			cwd: projectDir,
			env,
			encoding: "utf8",
			timeout: 300_000,
			shell: process.platform === "win32",
		})
		expect(install.status, install.stdout + install.stderr).toBe(0)
		const component = path.join(projectDir, "src", "ScaffoldAcceptance.vue")
		const spec = path.join(projectDir, "src", "ScaffoldAcceptance.test.js")
		fs.writeFileSync(
			component,
			'<script setup>import { ref } from "vue"; const count = ref(0)</script><template><button @click="count++">{{ count }}</button></template>',
		)
		fs.writeFileSync(
			spec,
			`import { it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import Component from "./ScaffoldAcceptance.vue"
it("compiles Vue and handles interaction", async () => {
 const wrapper = mount(Component)
 await wrapper.get("button").trigger("click")
 expect(wrapper.text()).toBe("1")
 wrapper.unmount()
})`,
		)
		try {
			const result = spawnSync(
				npm,
				["test", "--", "src/ScaffoldAcceptance.test.js"],
				{
					cwd: projectDir,
					env,
					encoding: "utf8",
					timeout: 120_000,
					shell: process.platform === "win32",
				},
			)
			expect(result.status, result.stdout + result.stderr).toBe(0)
			expect(result.stdout).toMatch(/1 passed/)
		} finally {
			fs.rmSync(component, { force: true })
			fs.rmSync(spec, { force: true })
		}
	}, 450_000)

	it("uses the exact packed local toolkit and patched schema graph without global fallback", async () => {
		const receipt = JSON.parse(fs.readFileSync(installReceipt, "utf8"))
		expect(receipt.requested).toEqual({ appui: "^0.2.0", toolkit: "^2.1.44" })
		expect(receipt.substituted).toContain("@gxp-dev/tools")
		const installed = createRequire(path.join(projectDir, "package.json"))
		const toolkitPackage = installed.resolve("@gxp-dev/tools/package.json")
		expect(
			toolkitPackage.startsWith(path.join(projectDir, "node_modules")),
		).toBe(true)
		expect(installed("@gxp-dev/tools/package.json").version).toBe("2.1.44")
		expect(
			JSON.parse(
				fs.readFileSync(
					path.join(projectDir, "node_modules/@gxp-dev/app-ui/package.json"),
					"utf8",
				),
			).version,
		).toMatch(/^0\.2\./)
		const toolkit = createRequire(toolkitPackage)
		const sdk = createRequire(
			toolkit.resolve("@modelcontextprotocol/sdk/server/mcp.js"),
		)
		expect(sdk("zod/package.json").version).toMatch(/^4\./)
		const sdkManifest = path.resolve(
			path.dirname(toolkit.resolve("@modelcontextprotocol/sdk/server/mcp.js")),
			"../../../package.json",
		)
		expect(JSON.parse(fs.readFileSync(sdkManifest, "utf8")).version).toMatch(
			/^1\.32\./,
		)
		expect(
			typeof toolkit(
				path.join(path.dirname(toolkitPackage), "mcp/lib/server.js"),
			).withSpecContext,
		).toBe("function")
		const lock = JSON.parse(
			fs.readFileSync(path.join(projectDir, "package-lock.json"), "utf8"),
		)
		const versions = Object.entries(lock.packages)
			.filter(([name]) => name.endsWith("/zod"))
			.map(([, pkg]) => pkg.version)
		expect(versions.length).toBeGreaterThan(0)
		expect(versions.every((version) => /^4\./.test(version))).toBe(true)
		expect(
			lock.packages["node_modules/@gxp-dev/tools"].integrity ||
				lock.packages["node_modules/@gxp-dev/tools"].resolved,
		).toBeTruthy()
		expect(candidateDigest).toMatch(/^[a-f0-9]{64}$/)
		const api = toolkit(
			path.join(path.dirname(toolkitPackage), "mcp/lib/server.js"),
		)
		const originalFetch = global.fetch
		const targets = []
		global.fetch = async (url) => {
			targets.push(url)
			return {
				ok: true,
				json: async () => ({
					paths: { "/synthetic": { get: { operationId: url } } },
				}),
			}
		}
		try {
			const results = await Promise.all(
				["develop", "testing"].map((environment) =>
					api.withSpecContext(
						{
							environment,
							specOrigin: `https://${environment}.scaffold.example.test`,
						},
						async () =>
							JSON.parse(
								(await api.handleToolCall("api_list_operation_ids", {}))
									.content[0].text,
							),
					),
				),
			)
			expect(results.map((result) => result.operations[0].operationId)).toEqual(
				[
					"https://develop.scaffold.example.test/api-specs/openapi.json",
					"https://testing.scaffold.example.test/api-specs/openapi.json",
				],
			)
			expect(targets).toHaveLength(2)
		} finally {
			global.fetch = originalFetch
		}
		fs.writeFileSync(
			path.join(fixtureDir, "resolved-candidate-receipt.json"),
			JSON.stringify({
				candidateDigest,
				installedToolkit: installed("@gxp-dev/tools/package.json").version,
				mcp: JSON.parse(fs.readFileSync(sdkManifest, "utf8")).version,
				sdkZod: sdk("zod/package.json").version,
				allZodVersions: versions,
				lockSha256: createHash("sha256")
					.update(fs.readFileSync(path.join(projectDir, "package-lock.json")))
					.digest("hex"),
				actualSpecTargets: targets,
				globalFallback: false,
			}),
		)
	})

	it("audits both the full generated graph and production dependencies", () => {
		const summaries = []
		for (const omit of [[], ["--omit=dev"]]) {
			const result = npmResult(["audit", "--json", ...omit])
			const audit = JSON.parse(result.stdout)
			fs.writeFileSync(
				path.join(
					fixtureDir,
					omit.length ? "production-audit.json" : "full-audit.json",
				),
				result.stdout,
			)
			summaries.push({
				scope: omit.length ? "production" : "full",
				status: result.status,
				counts: audit.metadata.vulnerabilities,
			})
		}
		expect(
			summaries.every(
				(result) => result.status === 0 && result.counts.total === 0,
			),
			JSON.stringify(summaries),
		).toBe(true)
	}, 180000)

	describe("gxdev build", () => {
		it("produces a .gxpapp file in dist/", () => {
			const buildResult = spawnSync(process.execPath, [localGxdev, "build"], {
				cwd: projectDir,
				env: localEnvironment(),
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
				[
					localGxdev,
					"dev",
					"--no-https",
					"--no-socket",
					"--port",
					String(port),
				],
				{
					cwd: projectDir,
					env: localEnvironment(),
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
					{ cause: err },
				)
			}

			try {
				const base = `http://127.0.0.1:${port}`
				const html = await (await fetch(base)).text()
				const modules = [
					...html.matchAll(
						/<script\b[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/g,
					),
				]
				expect(modules.length).toBeGreaterThan(0)
				for (const [, source] of modules) {
					const response = await fetch(new URL(source, base))
					expect(response.status, source + "\n" + (await response.text())).toBe(
						200,
					)
				}
				const bootstrap = await (
					await fetch(`${base}/@gx-runtime/main.js`)
				).text()
				expect(bootstrap).toContain("window.Pinia = Pinia")
				expect(bootstrap).toContain("window.Vue = Vue")
			} finally {
				devProcess.kill("SIGTERM")
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
