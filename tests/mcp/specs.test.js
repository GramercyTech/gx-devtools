import { test, afterEach } from "vitest"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
const loadModule = createRequire(import.meta.url)
const { getEnvUrls, fetchSpec } = loadModule("../../mcp/lib/specs.js")
const originalFetch = global.fetch
const originalNow = Date.now
const originalEnv = { ...process.env }
delete process.env.VITE_API_ENV
afterEach(() => {
	global.fetch = originalFetch
	Date.now = originalNow
	for (const key of ["API_ENV", "VITE_API_ENV", "GXDEV_API_SPEC_BASE_URL"]) {
		if (originalEnv[key] === undefined) delete process.env[key]
		else process.env[key] = originalEnv[key]
	}
})
test("default develop URLs remain unchanged", () => {
	delete process.env.GXDEV_API_SPEC_BASE_URL
	process.env.API_ENV = "develop"
	assert.equal(
		getEnvUrls().openApiSpec,
		"https://api.zenith-develop.env.eventfinity.app/api-specs/openapi.json",
	)
})
test("configured local HTTPS origin applies to all metadata types", () => {
	process.env.API_ENV = "local"
	process.env.GXDEV_API_SPEC_BASE_URL = "https://api.gxp.test"
	assert.deepEqual(getEnvUrls(), {
		apiBaseUrl: "https://api.gxp.test",
		openApiSpec: "https://api.gxp.test/api-specs/openapi.json",
		asyncApiSpec: "https://api.gxp.test/api-specs/asyncapi.json",
		webhookSpec: "https://api.gxp.test/api-specs/webhooks.json",
	})
})
test("invalid origins and unknown environments fail closed", () => {
	process.env.API_ENV = "local"
	for (const value of [
		"http://api.gxp.test",
		"https://u:p@api.gxp.test",
		"https://api.gxp.test/path",
		"https://api.gxp.test/?secret=x",
		"https://api.gxp.test/#x",
		"file:///tmp/spec",
	]) {
		process.env.GXDEV_API_SPEC_BASE_URL = value
		assert.throws(() => getEnvUrls())
	}
	delete process.env.GXDEV_API_SPEC_BASE_URL
	process.env.API_ENV = "typo"
	assert.throws(() => getEnvUrls(), /Unknown API environment/)
})
test("cache cannot reuse another environment specification", async () => {
	delete process.env.GXDEV_API_SPEC_BASE_URL
	const requests = []
	global.fetch = async (url, options) => {
		assert.ok(options.signal instanceof AbortSignal)
		assert.equal(options.redirect, "error")
		requests.push(url)
		return { ok: true, json: async () => ({ source: url }) }
	}
	process.env.API_ENV = "local"
	const local = await fetchSpec("openapi")
	process.env.API_ENV = "develop"
	const develop = await fetchSpec("openapi")
	assert.notEqual(local.source, develop.source)
	assert.deepEqual(await fetchSpec("openapi"), develop)
	assert.equal(requests.length, 2)
})
test("refreshing one type cannot extend another type cache lifetime", async () => {
	process.env.API_ENV = "local"
	process.env.GXDEV_API_SPEC_BASE_URL = "https://ttl.gxp.test"
	let now = 1_000_000
	Date.now = () => now
	const requests = []
	global.fetch = async (url) => {
		requests.push(url)
		return { ok: true, json: async () => ({}) }
	}
	await fetchSpec("openapi")
	now += 299_999
	await fetchSpec("asyncapi")
	now += 2
	await fetchSpec("openapi")
	assert.equal(requests.length, 3)
})
test("failed requests do not cache a response", async () => {
	process.env.API_ENV = "local"
	process.env.GXDEV_API_SPEC_BASE_URL = "https://failure.gxp.test"
	let calls = 0
	global.fetch = async () => {
		calls++
		return {
			ok: calls > 1,
			status: 503,
			json: async () => ({ recovered: true }),
		}
	}
	await assert.rejects(fetchSpec("openapi"), /503/)
	assert.deepEqual(await fetchSpec("openapi"), { recovered: true })
})
