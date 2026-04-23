/**
 * Tests for the GxP JSON config linter.
 */
import { describe, it, expect, beforeAll } from "vitest"
import path from "path"
import fs from "fs"
import os from "os"

// eslint-disable-next-line no-undef
const { lintFile, detectSchema } = require("../../bin/lib/lint")

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "gxp-lint-"))

function writeTmp(name, contents) {
	const p = path.join(TMP_ROOT, name)
	fs.writeFileSync(
		p,
		typeof contents === "string" ? contents : JSON.stringify(contents),
	)
	return p
}

describe("lint schema detection", () => {
	it("detects configuration.json", () => {
		expect(detectSchema("/a/b/configuration.json")).toBe(
			"configuration.schema.json",
		)
	})
	it("detects app-manifest.json", () => {
		expect(detectSchema("/a/b/app-manifest.json")).toBe(
			"app-manifest.schema.json",
		)
	})
	it("matches suffixed variants", () => {
		expect(detectSchema("/a/b/broken-configuration.json")).toBe(
			"configuration.schema.json",
		)
		expect(detectSchema("/a/b/test.app-manifest.json")).toBe(
			"app-manifest.schema.json",
		)
	})
	it("returns null for unknown names", () => {
		expect(detectSchema("/a/b/random.json")).toBeNull()
	})
})

describe("lint configuration.json", () => {
	it("passes a valid minimal form", () => {
		const file = writeTmp("valid.configuration.json", {
			additionalTabs: [
				{
					type: "card_list",
					cards: [
						{
							type: "fields_list",
							title: "General",
							fieldsList: [
								{ type: "text", name: "username", label: "Username" },
								{
									type: "select",
									name: "role",
									label: "Role",
									options: [
										{ label: "Admin", value: "admin" },
										{ label: "User", value: "user" },
									],
								},
							],
						},
					],
				},
			],
		})
		const result = lintFile(file)
		expect(result.ok).toBe(true)
		expect(result.errors).toEqual([])
	})

	it("flags an unknown field type", () => {
		const file = writeTmp("bad-field.configuration.json", {
			additionalTabs: [
				{
					type: "fields_list",
					fieldsList: [{ type: "definitely-not-a-real-type", name: "x" }],
				},
			],
		})
		const result = lintFile(file)
		expect(result.ok).toBe(false)
		expect(
			result.errors.some(
				(e) => e.code === "enum" && /fieldsList\/0\/type/.test(e.instancePath),
			),
		).toBe(true)
	})

	it("flags missing required field name on a text field", () => {
		const file = writeTmp("missing-name.configuration.json", {
			additionalTabs: [
				{
					type: "fields_list",
					fieldsList: [{ type: "text" }],
				},
			],
		})
		const result = lintFile(file)
		expect(result.ok).toBe(false)
		expect(
			result.errors.some(
				(e) => e.code === "required" && e.params?.missingProperty === "name",
			),
		).toBe(true)
	})

	it("flags a select with no options", () => {
		const file = writeTmp("no-options.configuration.json", {
			additionalTabs: [
				{
					type: "fields_list",
					fieldsList: [{ type: "select", name: "role" }],
				},
			],
		})
		const result = lintFile(file)
		expect(result.ok).toBe(false)
		expect(
			result.errors.some(
				(e) => e.code === "required" && e.params?.missingProperty === "options",
			),
		).toBe(true)
	})

	it("reports JSON parse errors", () => {
		const file = writeTmp("malformed.configuration.json", "{not json")
		const result = lintFile(file)
		expect(result.ok).toBe(false)
		expect(result.errors[0].code).toBe("json-parse-error")
	})
})

describe("lint app-manifest.json", () => {
	it("passes the toolkit's template manifest", () => {
		const file = path.resolve(__dirname, "../../template/app-manifest.json")
		const result = lintFile(file)
		expect(result.ok).toBe(true)
	})

	it("flags a bad asset_dir type", () => {
		const file = writeTmp("bad-assetdir.app-manifest.json", {
			name: "test",
			version: "1.0.0",
			asset_dir: 12345,
			strings: { default: {} },
		})
		const result = lintFile(file)
		expect(result.ok).toBe(false)
		expect(
			result.errors.some(
				(e) => e.code === "type" && /asset_dir/.test(e.instancePath),
			),
		).toBe(true)
	})

	it("flags a missing strings.default", () => {
		const file = writeTmp("no-default.app-manifest.json", {
			name: "test",
			version: "1.0.0",
			strings: { en: { hello: "hi" } },
		})
		const result = lintFile(file)
		expect(result.ok).toBe(false)
		expect(
			result.errors.some(
				(e) => e.code === "required" && e.params?.missingProperty === "default",
			),
		).toBe(true)
	})
})
