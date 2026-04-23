/**
 * Tests for extended MCP API tools. Uses __setCacheForTest to freeze a tiny
 * in-memory OpenAPI spec so nothing hits the network.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"

// eslint-disable-next-line no-undef
const {
	EXT_API_TOOLS,
	handleExtApiToolCall,
	isExtApiTool,
	walkOperations,
	schemaFieldNames,
} = require("../../mcp/lib/api-tools")
// eslint-disable-next-line no-undef
const { __setCacheForTest } = require("../../mcp/lib/specs")

const FAKE_OPENAPI = {
	openapi: "3.0.0",
	tags: [
		{ name: "Attendees", description: "Attendee operations" },
		{ name: "Projects" },
	],
	components: {
		schemas: {
			Attendee: {
				type: "object",
				properties: {
					id: { type: "string" },
					first_name: { type: "string" },
					last_name: { type: "string" },
					email: { type: "string" },
				},
			},
			Project: {
				type: "object",
				properties: {
					id: { type: "string" },
					slug: { type: "string" },
				},
			},
		},
	},
	paths: {
		"/v1/attendees": {
			get: {
				operationId: "attendees.index",
				summary: "List attendees",
				tags: ["Attendees"],
				"x-permission": "attendees.read",
				"x-permission-key": "attendees",
				responses: {
					200: {
						content: {
							"application/json": {
								schema: {
									type: "array",
									items: { $ref: "#/components/schemas/Attendee" },
								},
							},
						},
					},
				},
			},
			post: {
				operationId: "attendees.store",
				summary: "Create attendee",
				tags: ["Attendees"],
				"x-permission": "attendees.write",
				requestBody: {
					content: {
						"application/json": {
							schema: { $ref: "#/components/schemas/Attendee" },
						},
					},
				},
				responses: { 201: {} },
			},
		},
		"/v1/attendees/{id}": {
			get: {
				operationId: "attendees.show",
				summary: "Show attendee",
				tags: ["Attendees"],
				parameters: [
					{
						name: "id",
						in: "path",
						required: true,
						schema: { type: "string" },
					},
				],
				"x-permission": "attendees.read",
				responses: {
					200: {
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/Attendee" },
							},
						},
					},
				},
			},
		},
		"/v1/projects": {
			get: {
				operationId: "projects.index",
				tags: ["Projects"],
				responses: {
					200: {
						content: {
							"application/json": {
								schema: {
									type: "array",
									items: { $ref: "#/components/schemas/Project" },
								},
							},
						},
					},
				},
			},
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

function parseResult(res) {
	return JSON.parse(res.content[0].text)
}

describe("pure helpers", () => {
	it("walkOperations enumerates each method separately", () => {
		const ops = walkOperations(FAKE_OPENAPI)
		expect(ops).toHaveLength(4)
		const ids = ops.map((o) => o.op.operationId).sort()
		expect(ids).toEqual([
			"attendees.index",
			"attendees.show",
			"attendees.store",
			"projects.index",
		])
	})

	it("schemaFieldNames follows $ref", () => {
		const names = schemaFieldNames(
			{ $ref: "#/components/schemas/Attendee" },
			FAKE_OPENAPI.components,
		)
		expect(names).toEqual(
			expect.arrayContaining(["id", "first_name", "last_name", "email"]),
		)
	})
})

describe("tool registry", () => {
	it("registers the expected tool names", () => {
		const names = EXT_API_TOOLS.map((t) => t.name)
		for (const required of [
			"api_list_tags",
			"api_list_operation_ids",
			"api_get_operation_parameters",
			"api_find_endpoints_by_schema",
			"api_generate_dependency",
		]) {
			expect(names).toContain(required)
			expect(isExtApiTool(required)).toBe(true)
		}
	})
})

describe("api_list_tags", () => {
	it("returns tags with path counts", async () => {
		const out = parseResult(await handleExtApiToolCall("api_list_tags", {}))
		const attendees = out.tags.find((t) => t.name === "Attendees")
		expect(attendees.pathCount).toBe(3)
		expect(attendees.description).toBe("Attendee operations")
		expect(out.tags.find((t) => t.name === "Projects").pathCount).toBe(1)
	})
})

describe("api_list_operation_ids", () => {
	it("returns every operation with no filter", async () => {
		const out = parseResult(
			await handleExtApiToolCall("api_list_operation_ids", {}),
		)
		expect(out.operations).toHaveLength(4)
	})
	it("filters by tag", async () => {
		const out = parseResult(
			await handleExtApiToolCall("api_list_operation_ids", {
				tag: "Projects",
			}),
		)
		expect(out.operations).toHaveLength(1)
		expect(out.operations[0].operationId).toBe("projects.index")
	})
})

describe("api_get_operation_parameters", () => {
	it("returns the full detail including permission", async () => {
		const out = parseResult(
			await handleExtApiToolCall("api_get_operation_parameters", {
				operationId: "attendees.show",
			}),
		)
		expect(out.path).toBe("/v1/attendees/{id}")
		expect(out.method).toBe("GET")
		expect(out.parameters).toHaveLength(1)
		expect(out.permission).toBe("attendees.read")
	})
	it("reports missing operations cleanly", async () => {
		const out = parseResult(
			await handleExtApiToolCall("api_get_operation_parameters", {
				operationId: "nope",
			}),
		)
		expect(out.error).toMatch(/Operation not found/)
	})
})

describe("api_find_endpoints_by_schema", () => {
	it("finds by response field via $ref", async () => {
		const out = parseResult(
			await handleExtApiToolCall("api_find_endpoints_by_schema", {
				response_field: "first_name",
			}),
		)
		const ids = out.results.map((r) => r.operationId).sort()
		expect(ids).toEqual(["attendees.index", "attendees.show"])
	})
	it("finds by request field", async () => {
		const out = parseResult(
			await handleExtApiToolCall("api_find_endpoints_by_schema", {
				request_field: "email",
			}),
		)
		expect(out.results.map((r) => r.operationId)).toEqual(["attendees.store"])
	})
	it("combines path_pattern + method", async () => {
		const out = parseResult(
			await handleExtApiToolCall("api_find_endpoints_by_schema", {
				path_pattern: "/attendees",
				method: "GET",
			}),
		)
		const ids = out.results.map((r) => r.operationId).sort()
		expect(ids).toEqual(["attendees.index", "attendees.show"])
	})
	it("filters by tag", async () => {
		const out = parseResult(
			await handleExtApiToolCall("api_find_endpoints_by_schema", {
				tag: "Projects",
			}),
		)
		expect(out.results).toHaveLength(1)
		expect(out.results[0].path).toBe("/v1/projects")
	})
})

describe("api_generate_dependency", () => {
	it("builds the canonical shape for an entire tag", async () => {
		const out = parseResult(
			await handleExtApiToolCall("api_generate_dependency", {
				identifier: "attendees",
				tag: "Attendees",
			}),
		)
		expect(out.ok).toBe(true)
		expect(out.dependency.identifier).toBe("attendees")
		expect(out.dependency.model).toBe("Attendees")
		expect(out.dependency.permissionKey).toBe("attendees")
		expect(out.dependency.permissions).toEqual(
			expect.arrayContaining(["attendees.read", "attendees.write"]),
		)
		expect(Object.keys(out.dependency.operations).sort()).toEqual([
			"attendees.index",
			"attendees.show",
			"attendees.store",
		])
		expect(out.dependency.operations["attendees.index"]).toBe(
			"get:/v1/attendees",
		)
	})

	it("scopes to explicit operationIds + events", async () => {
		const out = parseResult(
			await handleExtApiToolCall("api_generate_dependency", {
				identifier: "attendees_read",
				tag: "Attendees",
				operationIds: ["attendees.index"],
				eventNames: ["attendees.created", "attendees.updated"],
			}),
		)
		expect(Object.keys(out.dependency.operations)).toEqual(["attendees.index"])
		expect(out.dependency.events).toEqual({
			"attendees.created": "attendees.created",
			"attendees.updated": "attendees.updated",
		})
	})

	it("reports a clean error when no operations match", async () => {
		const out = parseResult(
			await handleExtApiToolCall("api_generate_dependency", {
				identifier: "nope",
				tag: "NonexistentTag",
			}),
		)
		expect(out.ok).toBe(false)
		expect(out.error).toMatch(/No operations/)
	})

	it("appends to app-manifest.json when writeTo is set", async () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gxp-ext-api-"))
		const manifestPath = path.join(tmp, "app-manifest.json")
		fs.writeFileSync(
			manifestPath,
			JSON.stringify(
				{
					name: "t",
					version: "1.0.0",
					strings: { default: {} },
					dependencies: [],
				},
				null,
				"\t",
			),
		)

		const out = parseResult(
			await handleExtApiToolCall("api_generate_dependency", {
				identifier: "attendees",
				tag: "Attendees",
				writeTo: manifestPath,
			}),
		)
		expect(out.wrote).toBe(true)

		const saved = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
		expect(saved.dependencies).toHaveLength(1)
		expect(saved.dependencies[0].identifier).toBe("attendees")

		// Second call with same identifier should replace, not duplicate.
		const second = parseResult(
			await handleExtApiToolCall("api_generate_dependency", {
				identifier: "attendees",
				tag: "Attendees",
				operationIds: ["attendees.show"],
				writeTo: manifestPath,
			}),
		)
		expect(second.replaced).toBe(true)
		const reread = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
		expect(reread.dependencies).toHaveLength(1)
		expect(Object.keys(reread.dependencies[0].operations)).toEqual([
			"attendees.show",
		])
		fs.rmSync(tmp, { recursive: true, force: true })
	})
})
