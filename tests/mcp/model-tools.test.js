/**
 * Tests for describe_data_models. Uses __setCacheForTest to inject a fixed
 * OpenAPI spec so nothing hits the network.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"

// eslint-disable-next-line no-undef
const {
	MODEL_TOOLS,
	handleModelToolCall,
	isModelTool,
	describeDataModels,
	summarizeProperties,
} = require("../../mcp/lib/model-tools")
// eslint-disable-next-line no-undef
const { __setCacheForTest } = require("../../mcp/lib/specs")

const FAKE_OPENAPI = {
	openapi: "3.0.0",
	components: {
		schemas: {
			Attendee: {
				type: "object",
				description: "A person registered for the event",
				required: ["id", "email"],
				properties: {
					id: { type: "string", format: "uuid" },
					first_name: { type: "string" },
					last_name: { type: "string" },
					email: { type: "string", format: "email" },
					project: { $ref: "#/components/schemas/Project" },
					tags: { type: "array", items: { type: "string" } },
				},
			},
			Project: {
				type: "object",
				description: "An event project / tenant",
				required: ["id"],
				properties: {
					id: { type: "string" },
					slug: { type: "string" },
				},
			},
			Composed: {
				allOf: [
					{ $ref: "#/components/schemas/Project" },
					{
						type: "object",
						properties: {
							extra: { type: "string" },
						},
					},
				],
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

describe("tool registry", () => {
	it("registers describe_data_models", () => {
		expect(MODEL_TOOLS.map((t) => t.name)).toEqual(["describe_data_models"])
		expect(isModelTool("describe_data_models")).toBe(true)
		expect(isModelTool("unknown_tool")).toBe(false)
	})
})

describe("describeDataModels", () => {
	it("lists every schema by default", async () => {
		const result = await describeDataModels({})
		expect(result.ok).toBe(true)
		expect(result.count).toBe(3)
		const names = result.models.map((m) => m.name).sort()
		expect(names).toEqual(["Attendee", "Composed", "Project"])
	})

	it("returns one model by exact name", async () => {
		const result = await describeDataModels({ name: "Attendee" })
		expect(result.ok).toBe(true)
		expect(result.count).toBe(1)
		const m = result.models[0]
		expect(m.name).toBe("Attendee")
		expect(m.required).toEqual(["id", "email"])
		expect(m.properties.id).toMatchObject({ type: "string", format: "uuid" })
		expect(m.properties.email).toMatchObject({
			type: "string",
			format: "email",
		})
	})

	it("returns ok:false for an unknown exact name", async () => {
		const result = await describeDataModels({ name: "DoesNotExist" })
		expect(result.ok).toBe(false)
		expect(result.error).toContain("DoesNotExist")
		expect(result.available_count).toBe(3)
		expect(result.available_sample).toContain("Attendee")
	})

	it("filters by case-insensitive query across name + description", async () => {
		const hitByName = await describeDataModels({ query: "att" })
		expect(hitByName.count).toBe(1)
		expect(hitByName.models[0].name).toBe("Attendee")

		const hitByDescription = await describeDataModels({ query: "tenant" })
		expect(hitByDescription.count).toBe(1)
		expect(hitByDescription.models[0].name).toBe("Project")
	})

	it("renders $ref properties as the referenced model name", async () => {
		const result = await describeDataModels({ name: "Attendee" })
		expect(result.models[0].properties.project).toMatchObject({
			type: "Project",
		})
	})

	it("renders array items inline", async () => {
		const result = await describeDataModels({ name: "Attendee" })
		expect(result.models[0].properties.tags).toMatchObject({
			type: "array",
			items: "string",
		})
	})

	it("walks allOf compositions into a flat property map", async () => {
		const result = await describeDataModels({ name: "Composed" })
		const props = result.models[0].properties
		expect(Object.keys(props).sort()).toEqual(["extra", "id", "slug"])
	})
})

describe("summarizeProperties helper", () => {
	it("walks $ref one level deep without infinite recursion", () => {
		const self = {
			type: "object",
			properties: {
				me: { $ref: "#/components/schemas/Self" },
				name: { type: "string" },
			},
		}
		const spec = { components: { schemas: { Self: self } } }
		const summary = summarizeProperties(
			{ $ref: "#/components/schemas/Self" },
			spec,
		)
		expect(summary).not.toBeNull()
		expect(summary.name).toMatchObject({ type: "string" })
		expect(summary.me).toMatchObject({ type: "Self" })
	})
})

describe("handleModelToolCall", () => {
	it("wraps the result in MCP content shape", async () => {
		const res = await handleModelToolCall("describe_data_models", {
			name: "Project",
		})
		expect(res.content).toBeDefined()
		expect(res.content[0].type).toBe("text")
		const parsed = parseResult(res)
		expect(parsed.ok).toBe(true)
		expect(parsed.models[0].name).toBe("Project")
	})

	it("throws on an unknown tool name", async () => {
		await expect(handleModelToolCall("nope", {})).rejects.toThrow(
			/Unknown model tool/,
		)
	})
})
