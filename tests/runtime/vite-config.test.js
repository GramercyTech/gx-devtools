/**
 * Tests for the runtime Vite config factory.
 *
 * The lib-mode output is loaded directly by the browser (the platform does
 * `import(pluginUrl)`), so no downstream bundler ever substitutes
 * `process.env.NODE_ENV`. The config must define it at build time or any
 * surviving reference (reka-ui, vee-validate, etc.) throws ReferenceError in
 * production while dev works fine.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import viteConfigFactory, {
	resolveRuntimePackage,
} from "../../runtime/vite.config.js"

describe("runtime vite config", () => {
	afterEach(() => vi.unstubAllEnvs())

	it("exposes the configured preview origin to the runtime", async () => {
		vi.stubEnv("DEV_SERVER_ORIGIN", "https://session.dev.gxp.test")
		const config = await viteConfigFactory({
			mode: "development",
			command: "serve",
		})
		expect(config.define["import.meta.env.VITE_DEV_SERVER_ORIGIN"]).toBe(
			'"https://session.dev.gxp.test"',
		)
	})

	it("leaves the runtime origin empty for extension defaults", async () => {
		vi.stubEnv("DEV_SERVER_ORIGIN", "")
		const config = await viteConfigFactory({
			mode: "development",
			command: "serve",
		})
		expect(config.define["import.meta.env.VITE_DEV_SERVER_ORIGIN"]).toBe('""')
	})

	it("defines process.env.NODE_ENV for production builds", async () => {
		const config = await viteConfigFactory({
			mode: "production",
			command: "build",
		})

		expect(config.define["process.env.NODE_ENV"]).toBe('"production"')
	})

	it("leaves process.env.NODE_ENV to Vite's default handling in dev", async () => {
		const config = await viteConfigFactory({
			mode: "development",
			command: "serve",
		})

		expect(config.define).not.toHaveProperty("process.env.NODE_ENV")
	})

	it("keeps vue and pinia external with window globals in builds", async () => {
		const config = await viteConfigFactory({
			mode: "production",
			command: "build",
		})

		expect(config.build.rollupOptions.external).toEqual(["vue", "pinia"])
		expect(config.build.rollupOptions.output.globals).toEqual({
			vue: "Vue",
			pinia: "Pinia",
		})
	})
})

describe("runtime package resolution", () => {
	it("uses the project package when installed, otherwise the toolkit package", () => {
		const project = fs.mkdtempSync(path.join(os.tmpdir(), "gxdev-resolution-"))
		try {
			const toolkitRequire = createRequire(import.meta.url)
			for (const name of ["vue", "pinia"]) {
				expect(resolveRuntimePackage(name, project)).toBe(
					path.dirname(toolkitRequire.resolve(`${name}/package.json`)),
				)
				const local = path.join(project, "node_modules", name)
				fs.mkdirSync(local, { recursive: true })
				fs.writeFileSync(
					path.join(local, "package.json"),
					JSON.stringify({ name, version: "1.0.0" }),
				)
				expect(resolveRuntimePackage(name, project)).toBe(
					fs.realpathSync(local),
				)
			}
		} finally {
			fs.rmSync(project, { recursive: true, force: true })
		}
	})
})
