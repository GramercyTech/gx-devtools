/**
 * Tests for MCP test-tools (component scaffold + api route).
 * `test_api_route` talks to a tiny local HTTP server spun up per-test, so
 * nothing hits the real network.
 */
import {
	describe,
	it,
	expect,
	beforeEach,
	afterEach,
	beforeAll,
	afterAll,
} from "vitest"
import fs from "fs"
import os from "os"
import path from "path"
import http from "http"

// eslint-disable-next-line no-undef
const {
	TEST_TOOLS,
	handleTestToolCall,
	isTestTool,
	scaffoldComponentTest,
	substitutePathParams,
	buildQueryString,
	findOperation,
} = require("../../mcp/lib/test-tools")
// eslint-disable-next-line no-undef
const { __setCacheForTest } = require("../../mcp/lib/specs")

function parseResult(res) {
	return JSON.parse(res.content[0].text)
}

const FAKE_OPENAPI = {
	paths: {
		"/v1/attendees": {
			get: { operationId: "attendees.index", summary: "List attendees" },
			post: { operationId: "attendees.store" },
		},
		"/v1/attendees/{id}": {
			get: { operationId: "attendees.show" },
		},
	},
}

let restoreCache
beforeEach(() => {
	restoreCache = __setCacheForTest({ openapi: FAKE_OPENAPI })
})
afterEach(() => {
	restoreCache()
})

describe("tool registry", () => {
	it("surfaces expected tool names", () => {
		const names = TEST_TOOLS.map((t) => t.name)
		for (const n of ["test_scaffold_component_test", "test_api_route"]) {
			expect(names).toContain(n)
			expect(isTestTool(n)).toBe(true)
		}
	})
})

describe("pure helpers", () => {
	it("substitutes path params", () => {
		const out = substitutePathParams("/v1/users/{id}/posts/{postId}", {
			id: 42,
			postId: "abc",
		})
		expect(out.path).toBe("/v1/users/42/posts/abc")
		expect(out.missing).toEqual([])
	})
	it("reports missing path params", () => {
		const out = substitutePathParams("/v1/users/{id}", {})
		expect(out.missing).toEqual(["id"])
	})
	it("handles :colon-style parameters", () => {
		const out = substitutePathParams("/v1/users/:userId", { userId: 7 })
		expect(out.path).toBe("/v1/users/7")
	})
	it("builds query strings", () => {
		expect(
			buildQueryString({ page: 2, q: "hi", tags: ["a", "b"], empty: null }),
		).toBe("?page=2&q=hi&tags=a&tags=b")
	})
	it("finds operations by id", () => {
		const found = findOperation(FAKE_OPENAPI, "attendees.show")
		expect(found.path).toBe("/v1/attendees/{id}")
		expect(found.method).toBe("GET")
	})
})

describe("test_scaffold_component_test", () => {
	let tmp
	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gxp-scaffold-"))
		fs.mkdirSync(path.join(tmp, "src"), { recursive: true })
		fs.writeFileSync(
			path.join(tmp, "src", "Widget.vue"),
			`<template><div/></template>`,
		)
	})
	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true })
	})

	it("writes a test file with the @/ alias when component is under src/", () => {
		const out = scaffoldComponentTest({
			componentPath: path.join(tmp, "src", "Widget.vue"),
			projectRoot: tmp,
		})
		expect(out.ok).toBe(true)
		expect(out.test_path).toBe(path.join(tmp, "tests", "Widget.test.js"))
		expect(out.import_path).toBe("@/Widget.vue")
		const body = fs.readFileSync(out.test_path, "utf-8")
		expect(body).toMatch(/import Widget from "@\/Widget\.vue"/)
		expect(body).toMatch(/describe\("Widget"/)
		expect(body).toMatch(/it\.todo\(/)
	})

	it("falls back to a relative path when component is outside src/", () => {
		fs.writeFileSync(
			path.join(tmp, "Outside.vue"),
			`<template><div/></template>`,
		)
		const out = scaffoldComponentTest({
			componentPath: path.join(tmp, "Outside.vue"),
			projectRoot: tmp,
		})
		expect(out.ok).toBe(true)
		expect(out.import_path).toMatch(/Outside\.vue$/)
		expect(out.import_path.startsWith("@/")).toBe(false)
	})

	it("refuses to overwrite by default", () => {
		const first = scaffoldComponentTest({
			componentPath: path.join(tmp, "src", "Widget.vue"),
			projectRoot: tmp,
		})
		expect(first.ok).toBe(true)
		const second = scaffoldComponentTest({
			componentPath: path.join(tmp, "src", "Widget.vue"),
			projectRoot: tmp,
		})
		expect(second.ok).toBe(false)
		expect(second.error).toMatch(/already exists/)
	})

	it("overwrites when overwrite=true", () => {
		const p = path.join(tmp, "src", "Widget.vue")
		scaffoldComponentTest({ componentPath: p, projectRoot: tmp })
		const out = scaffoldComponentTest({
			componentPath: p,
			projectRoot: tmp,
			overwrite: true,
		})
		expect(out.ok).toBe(true)
	})

	it("fails gracefully on a missing component", () => {
		const out = scaffoldComponentTest({
			componentPath: path.join(tmp, "Nope.vue"),
			projectRoot: tmp,
		})
		expect(out.ok).toBe(false)
		expect(out.error).toMatch(/Component not found/)
	})
})

describe("test_api_route (against a local mock server)", () => {
	let server
	let baseUrl
	const calls = []

	beforeAll(async () => {
		server = http.createServer((req, res) => {
			calls.push({
				method: req.method,
				url: req.url,
				headers: req.headers,
			})
			if (req.url.startsWith("/v1/attendees/42")) {
				res.writeHead(200, { "Content-Type": "application/json" })
				res.end(JSON.stringify({ id: 42, name: "Ada" }))
			} else if (req.method === "POST" && req.url === "/v1/attendees") {
				let body = ""
				req.on("data", (c) => (body += c))
				req.on("end", () => {
					res.writeHead(201, { "Content-Type": "application/json" })
					res.end(JSON.stringify({ ok: true, received: JSON.parse(body) }))
				})
			} else if (req.url.startsWith("/v1/attendees")) {
				res.writeHead(200, { "Content-Type": "application/json" })
				res.end(JSON.stringify({ list: [] }))
			} else {
				res.writeHead(404)
				res.end("nope")
			}
		})
		await new Promise((resolve) =>
			server.listen(0, "127.0.0.1", () => resolve()),
		)
		baseUrl = `http://127.0.0.1:${server.address().port}`
	})

	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve))
	})

	beforeEach(() => {
		calls.length = 0
	})

	it("hits a GET with path params", async () => {
		const out = parseResult(
			await handleTestToolCall("test_api_route", {
				operationId: "attendees.show",
				pathParams: { id: 42 },
				baseUrl,
			}),
		)
		expect(out.ok).toBe(true)
		expect(out.response.status).toBe(200)
		expect(out.response.body).toEqual({ id: 42, name: "Ada" })
		expect(calls[0].method).toBe("GET")
		expect(calls[0].url).toBe("/v1/attendees/42")
	})

	it("serializes query params", async () => {
		const out = parseResult(
			await handleTestToolCall("test_api_route", {
				operationId: "attendees.index",
				query: { page: 2, q: "hi" },
				baseUrl,
			}),
		)
		expect(out.ok).toBe(true)
		expect(out.request.url).toMatch(/\/v1\/attendees\?page=2&q=hi/)
	})

	it("sends a JSON body on POST", async () => {
		const out = parseResult(
			await handleTestToolCall("test_api_route", {
				operationId: "attendees.store",
				body: { name: "Ada" },
				baseUrl,
			}),
		)
		expect(out.ok).toBe(true)
		expect(out.response.status).toBe(201)
		expect(out.response.body).toEqual({
			ok: true,
			received: { name: "Ada" },
		})
	})

	it("reports missing path parameters cleanly", async () => {
		const out = parseResult(
			await handleTestToolCall("test_api_route", {
				operationId: "attendees.show",
				baseUrl,
			}),
		)
		expect(out.ok).toBe(false)
		expect(out.required_parameters).toEqual(["id"])
	})

	it("reports unknown operations cleanly", async () => {
		const out = parseResult(
			await handleTestToolCall("test_api_route", {
				operationId: "nope",
				baseUrl,
			}),
		)
		expect(out.ok).toBe(false)
		expect(out.error).toMatch(/Operation not found/)
	})
})
