import { test, afterEach } from "vitest"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { AsyncResource } from "node:async_hooks"
import { createHash } from "node:crypto"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
const loadModule = createRequire(import.meta.url)
const specs = loadModule("../../mcp/lib/specs.js")
const server = loadModule("../../mcp/lib/server.js")
const originalFetch = global.fetch
const originalEnv = { ...process.env }
const context = (environment, suffix = environment) => ({
	environment,
	specOrigin: `https://${suffix}.catalog.example.test`,
})
const deferred = () => {
	let resolve
	const promise = new Promise((r) => {
		resolve = r
	})
	return { promise, resolve }
}
afterEach(() => {
	global.fetch = originalFetch
	for (const key of ["API_ENV", "VITE_API_ENV", "GXDEV_API_SPEC_BASE_URL"]) {
		if (originalEnv[key] === undefined) delete process.env[key]
		else process.env[key] = originalEnv[key]
	}
})

test("context API is host-only module API, not a model-advertised tool", async () => {
	assert.equal(server.withSpecContext, specs.withSpecContext)
	assert.equal(
		server.TOOLS.some((t) => /spec.?context/i.test(t.name)),
		false,
	)
	const observed = server.withSpecContext(context("testing", "tools"), () =>
		server.handleToolCall("get_api_environment", {
			environment: "develop",
			specOrigin: "https://model-selected.invalid",
		}),
	)
	const result = JSON.parse((await observed).content[0].text)
	assert.equal(result.environment, "testing")
	assert.equal(JSON.stringify(result).includes("model-selected"), false)
	assert.equal(
		JSON.stringify(result).includes("https://tools.catalog.example.test"),
		true,
	)
})
test("interleaved async tool requests retain independent environment and URL caches", async () => {
	const requests = [],
		first = deferred(),
		second = deferred()
	const a = context("develop", "interleaved-primary"),
		b = context("testing", "interleaved-secondary")
	global.fetch = async (url, options) => {
		requests.push(url)
		assert.equal(options.redirect, "error")
		assert.ok(options.signal instanceof AbortSignal)
		if (url.startsWith(a.specOrigin)) await first.promise
		else await second.promise
		return {
			ok: true,
			json: async () => ({ paths: { [url]: { get: { operationId: url } } } }),
		}
	}
	const envDigest = () =>
		createHash("sha256")
			.update(
				JSON.stringify(
					Object.entries(process.env).sort(([a], [b]) =>
						a < b ? -1 : a > b ? 1 : 0,
					),
				),
			)
			.digest("hex")
	const envBefore = envDigest()
	const run = (c) =>
		server.withSpecContext(c, async () => {
			await Promise.resolve()
			const result = await server.handleToolCall("api_list_operation_ids", {})
			assert.equal(specs.getEnvironment(), c.environment)
			assert.equal(specs.getEnvUrls().apiBaseUrl, c.specOrigin)
			return JSON.parse(result.content[0].text)
		})
	const one = run(a),
		two = run(b)
	second.resolve()
	const secondary = await two
	first.resolve()
	const primary = await one
	assert.equal(
		secondary.operations[0].operationId.startsWith(b.specOrigin),
		true,
	)
	assert.equal(primary.operations[0].operationId.startsWith(a.specOrigin), true)
	assert.equal(
		(await run(a)).operations[0].operationId,
		primary.operations[0].operationId,
	)
	assert.equal(
		(await run(b)).operations[0].operationId,
		secondary.operations[0].operationId,
	)
	assert.equal(requests.length, 2)
	assert.equal(envDigest(), envBefore)
})
test("context snapshot cannot be retargeted by mutations during an await", async () => {
	const original = context("testing", "immutable"),
		gate = deferred()
	const result = specs.withSpecContext(original, async () => {
		await gate.promise
		return { environment: specs.getEnvironment(), urls: specs.getEnvUrls() }
	})
	original.environment = "develop"
	original.specOrigin = "https://retargeted.invalid"
	gate.resolve()
	assert.deepEqual(await result, {
		environment: "testing",
		urls: {
			apiBaseUrl: "https://immutable.catalog.example.test",
			openApiSpec:
				"https://immutable.catalog.example.test/api-specs/openapi.json",
			asyncApiSpec:
				"https://immutable.catalog.example.test/api-specs/asyncapi.json",
			webhookSpec:
				"https://immutable.catalog.example.test/api-specs/webhooks.json",
		},
	})
})
test("nested contexts restore outer scope on success and error", async () => {
	const outer = context("develop", "nested-outer"),
		inner = context("testing", "nested-inner")
	await specs.withSpecContext(outer, async () => {
		await assert.rejects(
			specs.withSpecContext(inner, async () => {
				await Promise.resolve()
				assert.equal(specs.getEnvironment(), "testing")
				throw Error("synthetic")
			}),
			/synthetic/,
		)
		assert.equal(specs.getEnvironment(), "develop")
		assert.equal(specs.getEnvUrls().apiBaseUrl, outer.specOrigin)
		assert.equal(
			await specs.withSpecContext(inner, async () => specs.getEnvironment()),
			"testing",
		)
		assert.equal(specs.getEnvironment(), "develop")
	})
})
test("scoped cache cannot replace another origin even for the same environment", async () => {
	const requested = []
	global.fetch = async (url) => {
		requested.push(url)
		return { ok: true, json: async () => ({ source: url }) }
	}
	const one = context("develop", "same-env-one"),
		two = context("develop", "same-env-two")
	const a = await specs.withSpecContext(one, () => specs.fetchSpec("openapi"))
	const b = await specs.withSpecContext(two, () => specs.fetchSpec("openapi"))
	assert.notEqual(a.source, b.source)
	assert.deepEqual(
		await specs.withSpecContext(one, () => specs.fetchSpec("openapi")),
		a,
	)
	assert.deepEqual(
		await specs.withSpecContext(two, () => specs.fetchSpec("openapi")),
		b,
	)
	assert.equal(requested.length, 2)
})
test("failed scoped fetch is not cached and never falls back to ambient origin", async () => {
	process.env.GXDEV_API_SPEC_BASE_URL = "https://ambient.invalid"
	const requested = []
	global.fetch = async (url) => {
		requested.push(url)
		return {
			ok: requested.length > 1,
			status: 503,
			json: async () => ({ source: url }),
		}
	}
	const c = context("testing", "failed")
	await assert.rejects(
		specs.withSpecContext(c, () => specs.fetchSpec("asyncapi")),
		/503/,
	)
	const result = await specs.withSpecContext(c, () =>
		specs.fetchSpec("asyncapi"),
	)
	assert.equal(result.source, `${c.specOrigin}/api-specs/asyncapi.json`)
	assert.deepEqual(requested, [result.source, result.source])
})
test("scope wins over cwd and process configuration without changing unscoped CLI behavior", async () => {
	const previous = process.cwd(),
		directory = mkdtempSync(join(tmpdir(), "gxdev-context-"))
	process.env.API_ENV = "production"
	process.env.GXDEV_API_SPEC_BASE_URL = "https://unscoped.example.test"
	try {
		writeFileSync(join(directory, ".env"), "VITE_API_ENV=local\n")
		process.chdir(directory)
		assert.equal(specs.getEnvironment(), "local")
		assert.equal(specs.getEnvUrls().apiBaseUrl, "https://unscoped.example.test")
		await specs.withSpecContext(context("testing", "explicit"), async () => {
			await Promise.resolve()
			assert.equal(specs.getEnvironment(), "testing")
			assert.equal(
				specs.getEnvUrls().apiBaseUrl,
				"https://explicit.catalog.example.test",
			)
		})
		assert.equal(specs.getEnvironment(), "local")
		assert.equal(specs.getEnvUrls().apiBaseUrl, "https://unscoped.example.test")
	} finally {
		process.chdir(previous)
		rmSync(directory, { recursive: true, force: true })
	}
})
test("unrelated or deliberately context-free work does not inherit an earlier hosted scope", async () => {
	const outside = new AsyncResource("outside-hosted-scope")
	process.env.API_ENV = "local"
	delete process.env.VITE_API_ENV
	process.env.GXDEV_API_SPEC_BASE_URL = "https://cli-only.example.test"
	try {
		await specs.withSpecContext(context("testing", "no-leak"), async () => {
			assert.equal(
				outside.runInAsyncScope(() => specs.getEnvUrls().apiBaseUrl),
				"https://cli-only.example.test",
			)
			await Promise.resolve()
			assert.equal(specs.getEnvironment(), "testing")
		})
		assert.equal(specs.getEnvUrls().apiBaseUrl, "https://cli-only.example.test")
	} finally {
		outside.emitDestroy()
	}
})
test.each([
	null,
	{},
	{ environment: "testing" },
	{ specOrigin: "https://valid.example.test" },
	{ environment: "unknown", specOrigin: "https://valid.example.test" },
	{
		environment: "testing",
		specOrigin: "https://valid.example.test",
		extra: true,
	},
	...[
		"",
		null,
		"http://valid.example.test",
		"https://user:pass@valid.example.test",
		"https://valid.example.test/path",
		"https://valid.example.test/?x=1",
		"https://valid.example.test/#x",
		"file:///tmp/spec",
		"https://valid.example.test/",
		"https://valid.example.test#",
		"https://valid.example.test?",
	].map((specOrigin) => ({ environment: "testing", specOrigin })),
])(
	"invalid or partial context cannot invoke a callback or use fallback %#",
	(value) => {
		let called = false
		assert.throws(
			() =>
				specs.withSpecContext(value, () => {
					called = true
				}),
			/Invalid trusted/,
		)
		assert.equal(called, false)
	},
)
