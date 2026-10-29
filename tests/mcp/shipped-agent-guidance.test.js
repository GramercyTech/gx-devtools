import { test } from "vitest"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
const loadModule = createRequire(import.meta.url)
const { handleToolCall } = loadModule("../../mcp/lib/server.js")

test.each(["AGENTS.md", "GEMINI.md"])(
	"shipped %s agrees with the deployed store event contract",
	async (file) => {
		const guide = readFileSync(
			new URL(`../../template/${file}`, import.meta.url),
			"utf8",
		)
		const result = await handleToolCall("describe_store_api", {})
		const contract = result.content.map((block) => block.text || "").join("\n")
		for (const snippet of [
			"store.listen(socketName, eventName, callback)",
			"store.sockets[identifier][eventKey].listen(",
			"store.sockets.primary.listenForWhisper(",
		]) {
			assert.equal(guide.includes(snippet), true)
			assert.equal(contract.includes(snippet), true)
		}
		assert.match(guide, /development-only/)
		assert.match(guide, /unsubscribe/)
		assert.doesNotMatch(guide, /event name first|permission identifier second/i)
		assert.doesNotMatch(guide, /store\.listen\("SocialStreamPostCreated"/)
		assert.doesNotMatch(guide, /store\.listen\("primary"/)
	},
)
test("Claude wrapper still includes the corrected shared instructions", () => {
	assert.match(
		readFileSync(new URL("../../template/CLAUDE.md", import.meta.url), "utf8"),
		/^@AGENTS\.md$/m,
	)
})

test.each(["AGENTS.md", "GEMINI.md"])(
	"shipped %s preserves the platform PATCH helper without bypassing bindings",
	async (file) => {
		const guide = readFileSync(
			new URL(`../../template/${file}`, import.meta.url),
			"utf8",
		)
		const result = await handleToolCall("describe_store_api", {})
		const contract = result.content.map((block) => block.text || "").join("\n")
		assert.match(contract, /apiPatch\(endpoint, data = \{\}\)/)
		assert.match(
			guide,
			/`apiPatch\(endpoint, data\)` is a supported legacy platform helper/,
		)
		assert.match(
			guide,
			/use declared `callApi` bindings for new generated platform calls/,
		)
		assert.doesNotMatch(guide, /`apiPatch` is development-only/)
	},
)

test.each(["AGENTS.md", "GEMINI.md"])(
	"shipped %s permits required plugin artifacts while protecting the runtime",
	(file) => {
		const guide = readFileSync(
			new URL(`../../template/${file}`, import.meta.url),
			"utf8",
		)
		assert.match(
			guide,
			/You may also edit plugin-owned `app-manifest.json`, `configuration.json`, assets, tests, test fixtures, and the operator-instructions source declared by the manifest when the task requires them/,
		)
		assert.match(guide, /Do not edit the runtime container/)
		assert.doesNotMatch(
			guide,
			/(?:ONLY modify files|Only edit files)(?: under| in)? (?:the )?`src\//,
		)
	},
)

test.each(["AGENTS.md", "GEMINI.md"])(
	"shipped %s distinguishes manifest buckets from installed field bindings",
	(file) => {
		const guide = readFileSync(
			new URL(`../../template/${file}`, import.meta.url),
			"utf8",
		)
		for (const [manifest, field] of [
			["strings.default.<key>", "language_overrides.<key>"],
			["settings.<key>", "custom_settings.<key>"],
			["assets.<key>", "asset_list.<key>"],
			["dependencies[]", "dependency_list.<identifier>"],
		]) {
			assert.equal(
				guide
					.split("\n")
					.some(
						(line) =>
							line.startsWith(`- \`${manifest}\``) &&
							line.includes(`\`${field}\``),
					),
				true,
			)
		}
		assert.match(
			guide,
			/Set each field's `default` to the shipped manifest value/,
		)
		assert.doesNotMatch(guide, /name[^\n]*exactly match the manifest key/)
	},
)
