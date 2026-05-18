/**
 * Tests for constants.js
 */
import { describe, it, expect } from "vitest"
const {
	isWin,
	exportCmd,
	REQUIRED_DEPENDENCIES,
	REQUIRED_DEV_DEPENDENCIES,
	DEFAULT_SCRIPTS,
	DEFAULT_PORTS,
	ENVIRONMENT_URLS,
	PACKAGE_NAME,
	TAILWIND_VERSION,
	BASE_FRAMEWORK,
} = require("../../bin/lib/constants")

describe("constants", () => {
	describe("Platform detection", () => {
		it("should have isWin as a boolean", () => {
			expect(typeof isWin).toBe("boolean")
		})

		it("should have correct exportCmd based on platform", () => {
			if (isWin) {
				expect(exportCmd).toBe("set")
			} else {
				expect(exportCmd).toBe("export")
			}
		})
	})

	describe("REQUIRED_DEPENDENCIES", () => {
		it("should be an object", () => {
			expect(typeof REQUIRED_DEPENDENCIES).toBe("object")
			expect(REQUIRED_DEPENDENCIES).not.toBeNull()
		})

		it("should include dotenv (consumed at runtime by the dev command)", () => {
			expect(REQUIRED_DEPENDENCIES).toHaveProperty("dotenv")
		})

		it("should include @gxp-dev/uikit (component library)", () => {
			expect(REQUIRED_DEPENDENCIES).toHaveProperty("@gxp-dev/uikit")
		})

		it("should have version strings for all dependencies", () => {
			Object.values(REQUIRED_DEPENDENCIES).forEach((version) => {
				expect(typeof version).toBe("string")
				expect(version.length).toBeGreaterThan(0)
			})
		})
	})

	describe("REQUIRED_DEV_DEPENDENCIES", () => {
		it("should be an object", () => {
			expect(typeof REQUIRED_DEV_DEPENDENCIES).toBe("object")
			expect(REQUIRED_DEV_DEPENDENCIES).not.toBeNull()
		})

		it("should include @gxp-dev/tools (the toolkit itself)", () => {
			expect(REQUIRED_DEV_DEPENDENCIES).toHaveProperty("@gxp-dev/tools")
		})

		it("should include the eslint/prettier formatting stack", () => {
			expect(REQUIRED_DEV_DEPENDENCIES).toHaveProperty("eslint")
			expect(REQUIRED_DEV_DEPENDENCIES).toHaveProperty("eslint-plugin-vue")
			expect(REQUIRED_DEV_DEPENDENCIES).toHaveProperty("prettier")
		})

		it("should include the test harness (vitest + helpers)", () => {
			expect(REQUIRED_DEV_DEPENDENCIES).toHaveProperty("vitest")
			expect(REQUIRED_DEV_DEPENDENCIES).toHaveProperty("@vue/test-utils")
			expect(REQUIRED_DEV_DEPENDENCIES).toHaveProperty("happy-dom")
		})

		it("should include the tailwind dev stack pinned to TAILWIND_VERSION", () => {
			expect(REQUIRED_DEV_DEPENDENCIES).toHaveProperty("tailwindcss")
			expect(REQUIRED_DEV_DEPENDENCIES).toHaveProperty("@tailwindcss/vite")
			expect(REQUIRED_DEV_DEPENDENCIES.tailwindcss).toBe(TAILWIND_VERSION)
			expect(REQUIRED_DEV_DEPENDENCIES["@tailwindcss/vite"]).toBe(
				TAILWIND_VERSION,
			)
		})

		it("should have version strings for all dev dependencies", () => {
			Object.values(REQUIRED_DEV_DEPENDENCIES).forEach((version) => {
				expect(typeof version).toBe("string")
				expect(version.length).toBeGreaterThan(0)
			})
		})
	})

	describe("BASE_FRAMEWORK", () => {
		it("should be the tailwindcss@<version> string used in app-manifest", () => {
			expect(BASE_FRAMEWORK).toBe(`tailwindcss@${TAILWIND_VERSION}`)
		})
	})

	describe("DEFAULT_SCRIPTS", () => {
		it("should be an object", () => {
			expect(typeof DEFAULT_SCRIPTS).toBe("object")
			expect(DEFAULT_SCRIPTS).not.toBeNull()
		})

		it("should include dev script", () => {
			expect(DEFAULT_SCRIPTS).toHaveProperty("dev")
		})

		it("should include build script", () => {
			expect(DEFAULT_SCRIPTS).toHaveProperty("build")
		})

		it("should include dev-http script", () => {
			expect(DEFAULT_SCRIPTS).toHaveProperty("dev-http")
		})

		it("should include dev-http and setup-ssl scripts", () => {
			expect(DEFAULT_SCRIPTS).toHaveProperty("dev-http")
			expect(DEFAULT_SCRIPTS).toHaveProperty("setup-ssl")
		})

		it("should have string values for all scripts", () => {
			Object.values(DEFAULT_SCRIPTS).forEach((script) => {
				expect(typeof script).toBe("string")
				expect(script.length).toBeGreaterThan(0)
			})
		})
	})

	describe("DEFAULT_PORTS", () => {
		it("should be an object", () => {
			expect(typeof DEFAULT_PORTS).toBe("object")
			expect(DEFAULT_PORTS).not.toBeNull()
		})

		it("should have dev port as 3060", () => {
			expect(DEFAULT_PORTS.dev).toBe(3060)
		})

		it("should have socketIo port as 3069", () => {
			expect(DEFAULT_PORTS.socketIo).toBe(3069)
		})

		it("should have numeric port values", () => {
			Object.values(DEFAULT_PORTS).forEach((port) => {
				expect(typeof port).toBe("number")
				expect(port).toBeGreaterThan(0)
				expect(port).toBeLessThan(65536)
			})
		})
	})

	describe("ENVIRONMENT_URLS", () => {
		it("should be an object", () => {
			expect(typeof ENVIRONMENT_URLS).toBe("object")
			expect(ENVIRONMENT_URLS).not.toBeNull()
		})

		it("should include production environment", () => {
			expect(ENVIRONMENT_URLS).toHaveProperty("production")
		})

		it("should include develop environment", () => {
			expect(ENVIRONMENT_URLS).toHaveProperty("develop")
		})

		it("should include local environment", () => {
			expect(ENVIRONMENT_URLS).toHaveProperty("local")
		})

		it("should have apiBaseUrl for all environments", () => {
			Object.values(ENVIRONMENT_URLS).forEach((env) => {
				expect(typeof env).toBe("object")
				expect(env).toHaveProperty("apiBaseUrl")
				expect(env.apiBaseUrl).toMatch(/^https?:\/\//)
			})
		})

		it("should have documentation URL for all environments", () => {
			Object.values(ENVIRONMENT_URLS).forEach((env) => {
				expect(env).toHaveProperty("documentation")
				expect(env.documentation).toMatch(/^https?:\/\//)
			})
		})
	})

	describe("PACKAGE_NAME", () => {
		it("should be @gxp-dev/tools", () => {
			expect(PACKAGE_NAME).toBe("@gxp-dev/tools")
		})
	})
})
