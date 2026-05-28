/**
 * Integration tests for the GxP inspector dev-server endpoints that the in-page
 * element editor calls. Drives the plugin's configureServer middleware directly
 * against a temp project on disk (no real HTTP server needed).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"
import { Readable } from "stream"
import { gxpInspectorPlugin } from "../../runtime/vite-inspector-plugin.js"

let tmpDir
let prevCwd
let handler

function setupMiddleware() {
	const plugin = gxpInspectorPlugin()
	let captured = null
	const server = {
		middlewares: { use: (fn) => (captured = fn) },
		watcher: { add() {}, on() {} },
		ws: { send() {} },
	}
	plugin.configureServer(server)
	return captured
}

function call(method, url, body) {
	return new Promise((resolve) => {
		const req = Readable.from([body ? JSON.stringify(body) : ""])
		req.method = method
		req.url = url

		let payload = ""
		const res = {
			statusCode: 200,
			setHeader() {},
			end(chunk) {
				payload += chunk || ""
				resolve({ status: res.statusCode, json: JSON.parse(payload) })
			},
		}
		handler(req, res, () => resolve({ status: 0, json: null }))
	})
}

beforeEach(() => {
	prevCwd = process.cwd()
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gxp-inspect-"))
	process.chdir(tmpDir)
	fs.mkdirSync(path.join(tmpDir, "src"))
	fs.writeFileSync(
		path.join(tmpDir, "app-manifest.json"),
		JSON.stringify({ strings: { default: {} }, assets: {} }, null, 2),
	)
	handler = setupMiddleware()
})

afterEach(() => {
	process.chdir(prevCwd)
	fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("POST /update-element", () => {
	it("edits classes and style in the source .vue file by loc", async () => {
		const file = "src/Plugin.vue"
		fs.writeFileSync(
			path.join(tmpDir, file),
			`<template>\n\t<h1 class="old">Hi</h1>\n</template>\n`,
		)

		const res = await call("POST", "/__gxp-inspector/update-element", {
			loc: `${file}:2:2:h1`,
			set: { class: "new", style: "color: red" },
		})

		expect(res.json.success).toBe(true)
		const updated = fs.readFileSync(path.join(tmpDir, file), "utf-8")
		expect(updated).toContain('class="new"')
		expect(updated).toContain('style="color: red"')
	})

	it("replaces leaf text content", async () => {
		const file = "src/Plugin.vue"
		fs.writeFileSync(
			path.join(tmpDir, file),
			`<template>\n\t<h1>Hello</h1>\n</template>\n`,
		)
		await call("POST", "/__gxp-inspector/update-element", {
			loc: `${file}:2:2:h1`,
			set: { text: "Goodbye" },
		})
		const updated = fs.readFileSync(path.join(tmpDir, file), "utf-8")
		expect(updated).toContain(">Goodbye<")
		expect(updated).not.toContain("Hello")
	})
})

describe("extract-to-directive flow", () => {
	it("adds gxp-string attribute (update-element) + registers the string (add-string)", async () => {
		const file = "src/Plugin.vue"
		fs.writeFileSync(
			path.join(tmpDir, file),
			`<template>\n\t<h1>Welcome</h1>\n</template>\n`,
		)

		const tagRes = await call("POST", "/__gxp-inspector/update-element", {
			loc: `${file}:2:2:h1`,
			set: { attrs: { "gxp-string": "welcome_title" } },
		})
		expect(tagRes.json.success).toBe(true)

		const strRes = await call("POST", "/__gxp-inspector/add-string", {
			key: "welcome_title",
			value: "Welcome",
		})
		expect(strRes.json.success).toBe(true)

		const updated = fs.readFileSync(path.join(tmpDir, file), "utf-8")
		expect(updated).toContain('gxp-string="welcome_title"')
		const manifest = JSON.parse(
			fs.readFileSync(path.join(tmpDir, "app-manifest.json"), "utf-8"),
		)
		expect(manifest.strings.default.welcome_title).toBe("Welcome")
	})

	it("registers an asset via add-asset", async () => {
		const res = await call("POST", "/__gxp-inspector/add-asset", {
			key: "hero_image",
			value: "/dev-assets/images/hero.jpg",
		})
		expect(res.json.success).toBe(true)
		const manifest = JSON.parse(
			fs.readFileSync(path.join(tmpDir, "app-manifest.json"), "utf-8"),
		)
		expect(manifest.assets.hero_image).toBe("/dev-assets/images/hero.jpg")
	})
})

describe("update-element validation", () => {
	it("rejects a bad loc", async () => {
		const res = await call("POST", "/__gxp-inspector/update-element", {
			loc: "garbage",
			set: {},
		})
		expect(res.json.success).toBe(false)
	})
})
