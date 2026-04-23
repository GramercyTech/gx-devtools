/**
 * Tests for the config_extract_strings MCP tool.
 * Seeds a temp project with a Vue file using gxp-string + gxp-src + store calls
 * and verifies the tool reports keys and (optionally) merges them into a manifest.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"

// eslint-disable-next-line no-undef
const { handleConfigToolCall } = require("../../mcp/lib/config-tools")

function parseResult(res) {
	return JSON.parse(res.content[0].text)
}

const DEMO_VUE = `<template>
  <div>
    <h1 gxp-string="welcome_title">Welcome!</h1>
    <p gxp-string="intro_copy" gxp-settings>Intro</p>
    <img gxp-src="hero_image" src="/src/public/hero.jpg" />
  </div>
</template>

<script setup>
import { useGxpStore } from "@/stores/gxpPortalConfigStore"
const store = useGxpStore()

store.getString("cta_label", "Continue")
store.getSetting("theme_mode", "light")
store.getAsset("logo", "/src/public/logo.png")
store.getState("current_step", 0)
</script>
`

const GOOD_MANIFEST = {
	name: "test-plugin",
	version: "1.0.0",
	manifest_version: 3,
	asset_dir: "/src/public",
	settings: {},
	strings: { default: {} },
	assets: {},
	triggerState: {},
	dependencies: [],
	permissions: [],
}

let tmp
beforeEach(() => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gxp-extract-"))
	fs.mkdirSync(path.join(tmp, "src"), { recursive: true })
	fs.writeFileSync(path.join(tmp, "src", "DemoPage.vue"), DEMO_VUE)
})
afterEach(() => {
	fs.rmSync(tmp, { recursive: true, force: true })
})

describe("config_extract_strings (read-only)", () => {
	it("pulls keys out of template directives and script store calls", async () => {
		const out = parseResult(
			await handleConfigToolCall("config_extract_strings", {
				src_dir: path.join(tmp, "src"),
			}),
		)
		expect(out.ok).toBe(true)
		expect(out.counts.strings).toBeGreaterThan(0)

		// Template directives
		expect(out.extracted.strings).toHaveProperty("welcome_title")
		expect(out.extracted.settings).toHaveProperty("intro_copy")
		expect(out.extracted.assets).toHaveProperty("hero_image")

		// Script store calls
		expect(out.extracted.strings).toHaveProperty("cta_label")
		expect(out.extracted.settings).toHaveProperty("theme_mode")
		expect(out.extracted.assets).toHaveProperty("logo")
		expect(out.extracted.triggerState).toHaveProperty("current_step")
	})

	it("fails cleanly when src_dir is missing", async () => {
		const out = parseResult(
			await handleConfigToolCall("config_extract_strings", {
				src_dir: path.join(tmp, "does-not-exist"),
			}),
		)
		expect(out.ok).toBe(false)
		expect(out.error).toMatch(/Source directory not found/)
	})
})

describe("config_extract_strings (merge + write)", () => {
	it("merges extracted keys into app-manifest.json and keeps it lint-clean", async () => {
		const manifestPath = path.join(tmp, "app-manifest.json")
		fs.writeFileSync(manifestPath, JSON.stringify(GOOD_MANIFEST, null, "\t"))

		const out = parseResult(
			await handleConfigToolCall("config_extract_strings", {
				src_dir: path.join(tmp, "src"),
				writeTo: manifestPath,
			}),
		)
		expect(out.ok).toBe(true)
		expect(out.write.wrote).toBe(true)
		expect(out.write.ok).toBe(true)

		const saved = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
		expect(saved.strings.default).toHaveProperty("welcome_title")
		expect(saved.assets).toHaveProperty("hero_image")
		expect(saved.settings).toHaveProperty("theme_mode")
		expect(saved.triggerState).toHaveProperty("current_step")
	})

	it("does not overwrite existing values unless overwrite=true", async () => {
		const manifestPath = path.join(tmp, "app-manifest.json")
		const seeded = {
			...GOOD_MANIFEST,
			strings: { default: { welcome_title: "Existing Title" } },
		}
		fs.writeFileSync(manifestPath, JSON.stringify(seeded, null, "\t"))

		const out = parseResult(
			await handleConfigToolCall("config_extract_strings", {
				src_dir: path.join(tmp, "src"),
				writeTo: manifestPath,
			}),
		)
		expect(out.write.wrote).toBe(true)
		const saved = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
		expect(saved.strings.default.welcome_title).toBe("Existing Title")
	})

	it("overwrites when overwrite=true", async () => {
		const manifestPath = path.join(tmp, "app-manifest.json")
		const seeded = {
			...GOOD_MANIFEST,
			strings: { default: { welcome_title: "Existing Title" } },
		}
		fs.writeFileSync(manifestPath, JSON.stringify(seeded, null, "\t"))

		const out = parseResult(
			await handleConfigToolCall("config_extract_strings", {
				src_dir: path.join(tmp, "src"),
				writeTo: manifestPath,
				overwrite: true,
			}),
		)
		expect(out.write.wrote).toBe(true)
		const saved = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
		// extractor writes the defaultValue from the directive, which is "Welcome!"
		expect(saved.strings.default.welcome_title).toBe("Welcome!")
	})
})
