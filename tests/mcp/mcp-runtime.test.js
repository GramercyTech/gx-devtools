import { afterEach, describe, expect, it } from "vitest"
import { createRequire } from "node:module"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
const require = createRequire(import.meta.url)
const {
	assertMcpValidationRuntime,
	assertSupportedZodVersion,
} = require("../../mcp/lib/mcp-runtime")
let fixture
const generic = "Patched MCP validation runtime required."
afterEach(() => {
	if (fixture) fs.rmSync(fixture, { recursive: true, force: true })
})

describe("actual SDK validation-runtime boundary", () => {
	it.each(["4.6.7", "4.6.8", "4.7.0", "4.99.999"])(
		"accepts supported stable %s",
		(version) => expect(() => assertSupportedZodVersion(version)).not.toThrow(),
	)
	it.each([
		undefined,
		null,
		4,
		"3.25.76",
		"4.6.6",
		"4.5.999",
		"5.0.0",
		"4.6.7-beta.1",
		"4.6.7+build",
		"4.06.7",
		"4.999999999999999999999.0",
	])("rejects unsupported or ambiguous version %s", (version) =>
		expect(() => assertSupportedZodVersion(version)).toThrow(generic),
	)
	function setup(content) {
		fixture = fs.mkdtempSync(path.join(os.tmpdir(), "gxp-sdk-validation-"))
		const sdkEntry = path.join(
			fixture,
			"node_modules",
			"synthetic-sdk",
			"dist",
			"server.js",
		)
		fs.mkdirSync(path.dirname(sdkEntry), { recursive: true })
		fs.writeFileSync(sdkEntry, "")
		if (content !== undefined) {
			const pkg = path.join(fixture, "node_modules", "zod", "package.json")
			fs.mkdirSync(path.dirname(pkg), { recursive: true })
			fs.writeFileSync(pkg, content)
		}
		return sdkEntry
	}
	it("reads the installed SDK's own supported peer", () =>
		expect(() =>
			assertMcpValidationRuntime(
				setup(JSON.stringify({ name: "zod", version: "4.6.7" })),
			),
		).not.toThrow())
	it.each([
		undefined,
		"{malformed",
		JSON.stringify({ name: "zod" }),
		JSON.stringify({ version: "3.25.76" }),
		"x".repeat(32769),
	])(
		"rejects absent, malformed, legacy or oversized peer metadata without paths",
		(content) => {
			const entry = setup(content)
			try {
				assertMcpValidationRuntime(entry)
				expect.unreachable()
			} catch (error) {
				expect(error.message).toContain(generic)
				expect(error.stack).toBe(error.message)
				expect(error.message).not.toContain(fixture)
				expect(error.message).not.toContain("3.25.76")
			}
		},
	)
	it("returns a generic migration error when the SDK itself cannot resolve", () => {
		fixture = fs.mkdtempSync(path.join(os.tmpdir(), "gxp-missing-sdk-"))
		const helper = path.join(fixture, "runtime.js")
		fs.copyFileSync(require.resolve("../../mcp/lib/mcp-runtime"), helper)
		expect(() => require(helper).assertMcpValidationRuntime()).toThrow(generic)
	})
	it("does not substitute the toolkit's own patched Zod when the SDK peer is absent", () => {
		const entry = setup()
		expect(require("zod/package.json").version).toBe("4.6.7")
		expect(() => assertMcpValidationRuntime(entry)).toThrow(generic)
	})
})
