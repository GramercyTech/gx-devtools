import { describe, expect, it } from "vitest"
import fs from "node:fs"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const root = new URL("../../", import.meta.url)
const require = createRequire(import.meta.url)
const manifest = JSON.parse(
	fs.readFileSync(new URL("package.json", root), "utf8"),
)
const lock = JSON.parse(
	fs.readFileSync(new URL("package-lock.json", root), "utf8"),
)

describe("published toolkit dependency security policy", () => {
	it("keeps source CI locks identical for npm12 and earlier shrinkwrap-aware npm", () => {
		expect(fs.readFileSync(new URL("package-lock.json", root))).toEqual(
			fs.readFileSync(new URL("npm-shrinkwrap.json", root)),
		)
		expect(lock.packages[""].dependencies).toEqual(manifest.dependencies)
	})
	it("requires patched MCP and Zod while leaving AppUI a project dependency", () => {
		expect(manifest.dependencies["@modelcontextprotocol/sdk"]).toBe("^1.32.2")
		expect(manifest.dependencies.zod).toBe("^4.6.7")
		expect(manifest.dependencies["happy-dom"]).toBe("^21.0.4")
		expect(manifest.dependencies.vue).toBe("^3.5.44")
		expect(manifest.dependencies).not.toHaveProperty("@gxp-dev/app-ui")
		const { REQUIRED_DEPENDENCIES, REQUIRED_DEV_DEPENDENCIES } = require(
			fileURLToPath(new URL("bin/lib/constants.js", root)),
		)
		expect(REQUIRED_DEPENDENCIES["@gxp-dev/app-ui"]).toBe("^0.2.0")
		expect(REQUIRED_DEV_DEPENDENCIES["@gxp-dev/tools"]).toBe("^2.1.43")
		expect(REQUIRED_DEV_DEPENDENCIES["happy-dom"]).toBe("^21.0.4")
		expect(REQUIRED_DEV_DEPENDENCIES.vitest).toBe("^4.1.12")
	})
	it("has no legacy Zod3 or indirect AppUI in the exact source lock graph", () => {
		expect(lock.packages["node_modules/zod"].version).toBe("4.6.7")
		expect(
			lock.packages["node_modules/@modelcontextprotocol/sdk"].version,
		).toBe("1.32.2")
		expect(
			Object.keys(lock.packages).some((name) =>
				name.endsWith("/@gxp-dev/app-ui"),
			),
		).toBe(false)
		expect(
			Object.entries(lock.packages)
				.filter(([name]) => name.endsWith("/zod"))
				.map(([, pkg]) => pkg.version),
		).toEqual(["4.6.7"])
	})
})
