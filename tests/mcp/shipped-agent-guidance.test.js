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
