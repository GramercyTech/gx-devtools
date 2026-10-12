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
import { createServer } from "vite"
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

describe("selected toolkit runtime compatibility", () => {
	it("resolves legacy and current store imports to the selected runtime despite an older workspace copy", async () => {
		const project = fs.mkdtempSync(
			path.join(os.tmpdir(), "gxdev-legacy-runtime-"),
		)
		let server
		try {
			const legacyRoot = path.join(project, "node_modules/@gxp-dev/tools")
			fs.mkdirSync(path.join(legacyRoot, "runtime/stores"), { recursive: true })
			fs.writeFileSync(
				path.join(legacyRoot, "package.json"),
				JSON.stringify({
					name: "@gxp-dev/tools",
					version: "2.1.33",
					type: "module",
				}),
			)
			fs.writeFileSync(
				path.join(legacyRoot, "runtime/stores/gxpPortalConfigStore.js"),
				"export const useGxpStore = () => 'stale workspace runtime'\n",
			)
			const config = await viteConfigFactory({
				mode: "development",
				command: "serve",
			})
			server = await createServer({
				configFile: false,
				root: project,
				resolve: config.resolve,
				server: { middlewareMode: true, hmr: false, watch: null },
				optimizeDeps: { noDiscovery: true, include: [] },
			})
			const importer = path.join(project, "src/stores/index.js")
			const resolver = server.environments.client.pluginContainer
			const current = await resolver.resolveId(
				"@gx-runtime/stores/gxpPortalConfigStore",
				importer,
			)
			const legacy = await resolver.resolveId(
				"@gxp-dev/tools/runtime/stores/gxpPortalConfigStore",
				importer,
			)
			expect(current?.id).toBeTruthy()
			expect(legacy?.id).toBe(current.id)
			expect(fs.readFileSync(legacy.id, "utf8")).not.toContain(
				"stale workspace runtime",
			)
			const withExtension = await resolver.resolveId(
				"@gxp-dev/tools/runtime/stores/gxpPortalConfigStore.js",
				importer,
			)
			expect(withExtension?.id).toBe(current.id)
			const packageFile = await resolver.resolveId(
				"@gxp-dev/tools/package.json",
				importer,
			)
			expect(packageFile?.id).toBe(
				path.join(fs.realpathSync(legacyRoot), "package.json"),
			)
		} finally {
			await server?.close()
			fs.rmSync(project, { recursive: true, force: true })
		}
	})
})
