/**
 * Tests for list_uikit_components. Builds a tmpdir that mimics a plugin
 * project (package.json + node_modules/@gxp-dev/uikit) so we exercise the
 * createRequire-based resolution path without touching the real uikit.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"

// eslint-disable-next-line no-undef
const {
	UIKIT_TOOLS,
	handleUikitToolCall,
	isUikitTool,
	listUikitComponents,
	parseNamedExports,
} = require("../../mcp/lib/uikit-tools")

let tmpRoot
let projectRoot

function makeFakeUikit({ withDts = true, version = "0.1.42", dtsBody } = {}) {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gxp-uikit-test-"))
	projectRoot = path.join(tmpRoot, "plugin")
	const uikitRoot = path.join(projectRoot, "node_modules", "@gxp-dev", "uikit")
	const distDir = path.join(uikitRoot, "dist")

	fs.mkdirSync(distDir, { recursive: true })
	fs.writeFileSync(
		path.join(projectRoot, "package.json"),
		JSON.stringify({ name: "test-plugin", version: "1.0.0" }),
	)

	const uikitPkg = {
		name: "@gxp-dev/uikit",
		version,
		type: "module",
		main: "./dist/index.js",
		exports: {
			".": {
				import: "./dist/index.js",
				types: "./dist/index.d.ts",
			},
		},
	}
	fs.writeFileSync(
		path.join(uikitRoot, "package.json"),
		JSON.stringify(uikitPkg),
	)

	// Minimum stub for the JS entry so require.resolve("@gxp-dev/uikit")
	// succeeds even on Node versions that probe the file.
	fs.writeFileSync(path.join(distDir, "index.js"), "export {}")

	if (withDts) {
		const body =
			dtsBody ??
			`
declare const Button: unknown
export declare const Button: unknown
export declare const Dialog: unknown
export declare function useToast(): void
export declare class DataTable {}
export declare interface DialogProps { open: boolean }
export declare type ButtonVariant = "primary" | "ghost"
export { Card, Avatar as UserAvatar, internalHelper } from "./components"
`
		fs.writeFileSync(path.join(distDir, "index.d.ts"), body)
	}
	return { projectRoot, uikitRoot }
}

afterEach(() => {
	if (tmpRoot && fs.existsSync(tmpRoot)) {
		fs.rmSync(tmpRoot, { recursive: true, force: true })
	}
	tmpRoot = undefined
	projectRoot = undefined
})

describe("tool registry", () => {
	it("registers list_uikit_components", () => {
		expect(UIKIT_TOOLS.map((t) => t.name)).toEqual(["list_uikit_components"])
		expect(isUikitTool("list_uikit_components")).toBe(true)
		expect(isUikitTool("unknown")).toBe(false)
	})
})

describe("parseNamedExports", () => {
	it("picks up declared and re-exported names, including aliases", () => {
		const src = `
export declare const Button: unknown
export declare function useToast(): void
export declare class DataTable {}
export declare interface DialogProps { open: boolean }
export declare type ButtonVariant = "primary" | "ghost"
export { Card, Avatar as UserAvatar, internalHelper } from "./components"
`
		const names = parseNamedExports(src).sort()
		expect(names).toEqual(
			[
				"Button",
				"ButtonVariant",
				"Card",
				"DataTable",
				"DialogProps",
				"UserAvatar",
				"internalHelper",
				"useToast",
			].sort(),
		)
	})

	it("returns an empty list when no exports are present", () => {
		expect(parseNamedExports("// nothing here").length).toBe(0)
	})
})

describe("listUikitComponents", () => {
	it("lists sorted PascalCase exports + version when uikit is installed", () => {
		const { projectRoot } = makeFakeUikit({ version: "0.1.42" })
		const result = listUikitComponents({ cwd: projectRoot })
		expect(result.ok).toBe(true)
		expect(result.package.name).toBe("@gxp-dev/uikit")
		expect(result.package.version).toBe("0.1.42")
		// Only PascalCase entries; useToast / internalHelper are filtered out.
		expect(result.components).toEqual([
			"Button",
			"ButtonVariant",
			"Card",
			"DataTable",
			"Dialog",
			"DialogProps",
			"UserAvatar",
		])
		expect(result.count).toBe(7)
	})

	it("applies a case-insensitive substring filter", () => {
		const { projectRoot } = makeFakeUikit()
		const result = listUikitComponents({ cwd: projectRoot, filter: "dialog" })
		expect(result.ok).toBe(true)
		expect(result.components).toEqual(["Dialog", "DialogProps"])
	})

	it("returns ok:false when uikit is not installed", () => {
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gxp-uikit-test-"))
		projectRoot = path.join(tmpRoot, "plugin")
		fs.mkdirSync(projectRoot, { recursive: true })
		fs.writeFileSync(
			path.join(projectRoot, "package.json"),
			JSON.stringify({ name: "test-plugin" }),
		)

		const result = listUikitComponents({ cwd: projectRoot })
		expect(result.ok).toBe(false)
		expect(result.error).toMatch(/Could not resolve @gxp-dev\/uikit/)
	})

	it("returns ok:false with a clear message when dist/index.d.ts is missing", () => {
		const { projectRoot, uikitRoot } = makeFakeUikit()
		fs.rmSync(path.join(uikitRoot, "dist", "index.d.ts"))
		const result = listUikitComponents({ cwd: projectRoot })
		expect(result.ok).toBe(false)
		expect(result.error).toMatch(/dist\/index\.d\.ts is missing/)
		expect(result.resolved).toBe(uikitRoot)
	})
})

describe("handleUikitToolCall", () => {
	it("wraps the result in MCP content shape", async () => {
		const { projectRoot } = makeFakeUikit()
		const res = await handleUikitToolCall("list_uikit_components", {
			cwd: projectRoot,
		})
		expect(res.content[0].type).toBe("text")
		const parsed = JSON.parse(res.content[0].text)
		expect(parsed.ok).toBe(true)
		expect(parsed.components).toContain("Button")
	})

	it("throws on an unknown tool name", async () => {
		await expect(handleUikitToolCall("nope", {})).rejects.toThrow(
			/Unknown uikit tool/,
		)
	})
})
