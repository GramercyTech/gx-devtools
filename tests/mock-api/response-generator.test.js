/**
 * Tests for runtime/mock-api/response-generator.js
 *
 * Covers x-faker directive resolution and integration with generateValue /
 * generateFromSchema. Network and file-system are not involved.
 */
import { describe, expect, it } from "vitest"
import {
	generateFromSchema,
	generateValue,
	resolveXFaker,
} from "../../runtime/mock-api/response-generator.js"

describe("resolveXFaker", () => {
	it("resolves a dot-notation path to a faker function", () => {
		const fn = resolveXFaker("internet.ipv4")
		expect(typeof fn).toBe("function")
		const value = fn()
		expect(value).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)
	})

	it("resolves a bare method name by searching faker namespaces", () => {
		const fn = resolveXFaker("ipv4")
		expect(typeof fn).toBe("function")
		const value = fn()
		expect(value).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)
	})

	it("resolves firstName via bare name", () => {
		const fn = resolveXFaker("firstName")
		expect(typeof fn).toBe("function")
		expect(typeof fn()).toBe("string")
	})

	it("resolves person.firstName via dot notation", () => {
		const fn = resolveXFaker("person.firstName")
		expect(typeof fn).toBe("function")
		expect(typeof fn()).toBe("string")
	})

	it("returns null for an unknown bare name", () => {
		const fn = resolveXFaker("nonExistentMethod12345")
		expect(fn).toBeNull()
	})

	it("returns null for an unresolvable dot-notation path", () => {
		const fn = resolveXFaker("internet.nonExistentMethod12345")
		expect(fn).toBeNull()
	})

	it("returns null for empty string", () => {
		expect(resolveXFaker("")).toBeNull()
	})

	it("returns null for non-string input", () => {
		expect(resolveXFaker(null)).toBeNull()
		expect(resolveXFaker(42)).toBeNull()
	})
})

describe("generateValue — x-faker directive", () => {
	it("uses x-faker over format when both are present", () => {
		// schema has format: 'email' but x-faker: 'ipv4' — ipv4 should win
		const value = generateValue("string", "email", {
			"x-faker": "internet.ipv4",
		})
		expect(value).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)
	})

	it("falls back to format generation when x-faker is invalid", () => {
		const value = generateValue("string", "email", {
			"x-faker": "nonExistentMethod12345",
		})
		expect(value).toMatch(/@/)
	})

	it("generates a first name via bare x-faker value", () => {
		const value = generateValue("string", undefined, {
			"x-faker": "firstName",
		})
		expect(typeof value).toBe("string")
		expect(value.length).toBeGreaterThan(0)
	})

	it("x-faker takes precedence over property name hints", () => {
		// property name 'email' would normally generate an email, but x-faker overrides
		const value = generateValue("string", undefined, {
			"x-faker": "internet.ipv4",
			propertyName: "email",
		})
		expect(value).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)
	})

	it("enum still takes precedence over x-faker", () => {
		const value = generateValue("string", undefined, {
			enum: ["fixed"],
			"x-faker": "internet.ipv4",
		})
		expect(value).toBe("fixed")
	})

	it("example still takes precedence over x-faker", () => {
		const value = generateValue("string", undefined, {
			example: "explicit-example",
			"x-faker": "internet.ipv4",
		})
		expect(value).toBe("explicit-example")
	})
})

describe("generateFromSchema — x-faker on properties", () => {
	it("applies x-faker to a string property inside an object schema", () => {
		const schema = {
			type: "object",
			properties: {
				ip_address: {
					type: "string",
					"x-faker": "internet.ipv4",
				},
				name: {
					type: "string",
					"x-faker": "person.firstName",
				},
			},
		}

		const result = generateFromSchema(schema, {})
		expect(result.ip_address).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)
		expect(typeof result.name).toBe("string")
		expect(result.name.length).toBeGreaterThan(0)
	})

	it("applies x-faker inside array items", () => {
		const schema = {
			type: "array",
			minItems: 2,
			maxItems: 2,
			items: {
				type: "string",
				"x-faker": "internet.ipv4",
			},
		}

		const result = generateFromSchema(schema, {})
		expect(result).toHaveLength(2)
		result.forEach((v) => {
			expect(v).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)
		})
	})
})
