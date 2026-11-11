import { test } from "vitest"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { createRequire } from "node:module"
const loadModule = createRequire(import.meta.url)
const { handleToolCall } = loadModule("../../mcp/lib/server.js")

test.each(["AGENTS.md"])(
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

test.each(["AGENTS.md"])(
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

test.each(["AGENTS.md"])(
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

test.each(["AGENTS.md"])(
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

const skillDir = new URL("../../template/skills/gxp-plugin/", import.meta.url)
const shippedGuidance = [
	"AGENTS.md",
	"CLAUDE.md",
	".claude/agents/gxp-developer.md",
	"codex/agents/gxp-developer.toml",
	"skills/gxp-plugin/SKILL.md",
	...readdirSync(new URL("references/", skillDir)).map(
		(name) => `skills/gxp-plugin/references/${name}`,
	),
]
const readShipped = (file) =>
	readFileSync(new URL(`../../template/${file}`, import.meta.url), "utf8")

test.each(shippedGuidance)("shipped %s avoids retired guidance", (file) => {
	const guide = readShipped(file)
	assert.doesNotMatch(guide, /event name first|permission identifier second/i)
	assert.doesNotMatch(guide, /store\.listen\("SocialStreamPostCreated"/)
	assert.doesNotMatch(guide, /store\.listen\("primary"/)
	assert.doesNotMatch(guide, /`apiPatch` is development-only/)
	assert.doesNotMatch(
		guide,
		/(?:ONLY modify files|Only edit files)(?: under| in)? (?:the )?`src\//,
	)
	assert.doesNotMatch(guide, /name[^\n]*exactly match the manifest key/)
})

test("skill references named in SKILL.md all exist and vice versa", () => {
	const skill = readShipped("skills/gxp-plugin/SKILL.md")
	assert.match(skill, /^---\nname: gxp-plugin\ndescription: .+\n---/)
	const named = [...skill.matchAll(/`references\/([\w-]+\.md)`/g)].map(
		(m) => m[1],
	)
	assert.deepEqual(
		[...new Set(named)].sort(),
		readdirSync(new URL("references/", skillDir)).sort(),
	)
})

test("subagent wrappers delegate to the shared skill", () => {
	const claude = readShipped(".claude/agents/gxp-developer.md")
	assert.match(claude, /^skills:\n {2}- gxp-plugin$/m)
	assert.doesNotMatch(claude, /^tools:/m)
	const codex = readShipped("codex/agents/gxp-developer.toml")
	for (const key of ["name", "description", "developer_instructions"]) {
		assert.match(codex, new RegExp(`^${key} = `, "m"))
	}
	assert.match(codex, /gxp-plugin/)
})

test("skill documents codec-safe media uploads", () => {
	const guide = readShipped("skills/gxp-plugin/references/media-uploads.md")
	assert.match(guide, /Content-Type: video\/webm;codecs=vp8,opus/)
	assert.match(guide, /\[`attachment\.\$\{ext\}`\]: file/)
	assert.match(guide, /Never strip codec parameters from the Content-Type/)
	assert.doesNotMatch(guide, /type: "video\/webm" \}\)|mime: "video\/webm" \}/)
})

test("skill documents the 20 MB large_upload presigned flow", () => {
	const guide = readShipped("skills/gxp-plugin/references/media-uploads.md")
	assert.match(guide, /LARGE_UPLOAD_THRESHOLD_BYTES = 20 \* 1024 \* 1024/)
	assert.match(guide, /large_upload: true/)
	assert.match(guide, /upload_urls\?\.\[filename\]/)
	assert.match(
		guide,
		/PUT `Content-Type` must exactly equal the `type` sent in step 1/,
	)
	assert.match(
		readShipped("AGENTS.md"),
		/single exception is PUTting file bytes to a presigned storage URL/,
	)
})
