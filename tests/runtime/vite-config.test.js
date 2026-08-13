/**
 * Tests for the runtime Vite config factory.
 *
 * The lib-mode output is loaded directly by the browser (the platform does
 * `import(pluginUrl)`), so no downstream bundler ever substitutes
 * `process.env.NODE_ENV`. The config must define it at build time or any
 * surviving reference (reka-ui, vee-validate, etc.) throws ReferenceError in
 * production while dev works fine.
 */
import { describe, it, expect } from "vitest"
import viteConfigFactory from "../../runtime/vite.config.js"

describe("runtime vite config", () => {
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
