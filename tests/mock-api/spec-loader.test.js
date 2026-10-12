import { afterEach, describe, expect, it, vi } from "vitest"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const axios = require("axios")
const {
	getEnvironmentConfig,
	loadSpecs,
} = require("../../runtime/mock-api/spec-loader.js")

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
})

describe("mock specification origin", () => {
	it("selects local public metadata without changing the API transport", () => {
		vi.stubEnv("GXDEV_API_SPEC_BASE_URL", "https://api.gxp.test/")
		const config = getEnvironmentConfig("develop")
		expect(config.apiBaseUrl).toBe(
			"https://api.zenith-develop.env.eventfinity.app",
		)
		expect(config.openApiSpec).toBe(
			"https://api.gxp.test/api-specs/openapi.json",
		)
		expect(config.asyncApiSpec).toBe(
			"https://api.gxp.test/api-specs/asyncapi.json",
		)
		expect(config.webhookSpec).toBe(
			"https://api.gxp.test/api-specs/webhooks.json",
		)
	})
	it.each([
		"http://api.gxp.test",
		"https://u:secret@api.gxp.test",
		"https://api.gxp.test/path",
		"https://api.gxp.test/?secret=x",
		"https://api.gxp.test/#x",
		"invalid",
	])("rejects invalid origin %s without echoing its contents", (origin) => {
		vi.stubEnv("GXDEV_API_SPEC_BASE_URL", origin)
		expect(() => getEnvironmentConfig("develop")).toThrow(
			"GXDEV_API_SPEC_BASE_URL must be an HTTPS origin without credentials",
		)
	})
	it("does not reuse mock schemas across configured origins", async () => {
		vi.stubEnv("API_ENV", "develop")
		const get = vi.fn(async (url) => ({ data: { source: url } }))
		vi.spyOn(axios, "create").mockReturnValue({ get })
		vi.stubEnv("GXDEV_API_SPEC_BASE_URL", "https://first.gxp.test")
		const first = await loadSpecs("/nonexistent/mock-qa", true)
		expect(first.openApi.source).toBe(
			"https://first.gxp.test/api-specs/openapi.json",
		)
		await loadSpecs("/nonexistent/mock-qa")
		expect(get).toHaveBeenCalledTimes(3)
		vi.stubEnv("GXDEV_API_SPEC_BASE_URL", "https://second.gxp.test")
		const second = await loadSpecs("/nonexistent/mock-qa")
		expect(second.openApi.source).toBe(
			"https://second.gxp.test/api-specs/openapi.json",
		)
		expect(get).toHaveBeenCalledTimes(6)
	})
})
