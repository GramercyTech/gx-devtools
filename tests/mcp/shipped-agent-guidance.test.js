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

test("skill requires patching WebM duration before upload", () => {
	const guide = readShipped("skills/gxp-plugin/references/media-uploads.md")
	assert.match(
		guide,
		/import \{ fixWebmDuration \} from "@fix-webm-duration\/fix"/,
	)
	assert.match(
		guide,
		/fixWebmDuration\(blob, durationMs, \{ logger: false \}\)/,
	)
	assert.match(readShipped("skills/gxp-plugin/SKILL.md"), /fixWebmDuration/)
})

test("skill's signed-manifest filter is scoped to the signed folder", async () => {
	const guide = readShipped("skills/gxp-plugin/references/video-playback.md")
	const code = guide
		.match(/```javascript\n([\s\S]*?)```/)[1]
		.split("// usage")[0]
		.replace(/^export /gm, "")
	const { parseSignedManifest, signUri, registerSignedRequests } = new Function(
		`${code}; return { parseSignedManifest, signUri, registerSignedRequests }`,
	)()
	const dir =
		"https://cdn.example.test/uploads/social-posts/12/file_path/transcoded/"
	const query = "URLPrefix=abc&Expires=1&KeyName=k&Signature=s"
	const signed = parseSignedManifest(`${dir}manifest.m3u8?${query}`)
	assert.deepEqual(signed, { query, prefix: dir })
	assert.equal(
		signUri(`${dir}hd/seg-1.ts`, signed),
		`${dir}hd/seg-1.ts?${query}`,
	)
	for (const uri of [
		"https://other.example.test/uploads/social-posts/12/file_path/transcoded/a.ts",
		"https://cdn.example.test/uploads/social-posts/13/file_path/transcoded/a.ts",
		`${dir}a.ts?token=1`,
	]) {
		assert.equal(signUri(uri, signed), uri)
	}
	const filters = []
	const engine = {
		registerRequestFilter: (f) => filters.push(f),
		unregisterRequestFilter: (f) => filters.splice(filters.indexOf(f), 1),
	}
	const stop = registerSignedRequests(
		{ getNetworkingEngine: () => engine },
		`${dir}manifest.m3u8?${query}`,
	)
	assert.equal(filters.length, 1)
	stop()
	assert.equal(filters.length, 0)
	assert.match(
		readShipped("skills/gxp-plugin/SKILL.md"),
		/references\/video-playback\.md/,
	)
	assert.match(guide, /only detect `gxp-track` attributes/)
})

test("describe_store_api documents uploads and userSession for the deployed platform", async () => {
	const result = await handleToolCall("describe_store_api", {})
	const { reference: contract } = JSON.parse(
		result.content.map((block) => block.text || "").join(""),
	)
	assert.match(contract, /`store\.userSession`/)
	assert.match(contract, /\{ "attachment\.webm": file \}/)
	assert.match(contract, /large_upload: true/)
	assert.match(contract, /fixWebmDuration/)
	assert.match(contract, /user_session: store\.userSession/)
})

test("skill's hand-written social stream dependency avoids the malformed like path", () => {
	const guide = readShipped("skills/gxp-plugin/references/api-calls.md")
	const entry = JSON.parse(
		guide.match(
			/```json\n(\{\n\s*"identifier": "social_stream"[\s\S]*?)```/,
		)[1],
	)
	assert.equal(entry.permissionKey, "social_stream")
	for (const op of Object.values(entry.operations)) {
		assert.match(
			op,
			/^(get|post):\/v1\/projects\/\{teamSlug\}\/\{projectSlug\}\//,
		)
	}
	assert.equal(
		Object.keys(entry.operations).some((id) => id.includes("likes")),
		false,
	)
})

test("skill's uploadMedia module routes by size and keeps the full type", async () => {
	const guide = readShipped("skills/gxp-plugin/references/media-uploads.md")
	assert.doesNotMatch(guide, /silently dropped|must stay inline/)
	assert.match(guide, /Content-Type must exactly equal the `type` you declared/)
	assert.match(
		readShipped("AGENTS.md"),
		/single exception is PUTting file bytes to a presigned storage URL/,
	)
	const code = guide
		.match(
			/## Upload with `uploadMedia`[\s\S]*?```javascript\n([\s\S]*?)```/,
		)[1]
		.replace(/^export /gm, "")
	const mod = new Function(
		"File",
		`${code}; return { uploadMedia, uploadFormat, UploadError, LARGE_UPLOAD_THRESHOLD_BYTES }`,
	)(
		class {
			constructor(parts, name, options) {
				Object.assign(this, { parts, name, type: options.type })
			}
		},
	)
	assert.equal(mod.LARGE_UPLOAD_THRESHOLD_BYTES, 20 * 1024 * 1024)
	assert.throws(() => mod.uploadFormat("video/x-matroska"), /Unsupported/)
	const calls = []
	const store = {
		userSession: "s1",
		callApi: async (op, id, data) => {
			calls.push(data)
			return {
				data: { id: 1, upload_urls: { "attachment.webm": "https://put" } },
			}
		},
	}
	const type = "video/webm;codecs=vp8,opus"
	await mod.uploadMedia(store, {
		operationId: "op",
		identifier: "id",
		blob: { size: 10, type },
		withUserSession: true,
		data: { user_session: "forged" },
	})
	assert.equal(calls[0]["attachment.webm"].type, type)
	assert.equal(calls[0].user_session, "s1")
	const puts = []
	await mod.uploadMedia(store, {
		operationId: "op",
		identifier: "id",
		blob: { size: 30 * 1024 * 1024, type },
		put: async (...args) => puts.push(args),
	})
	assert.equal(calls[1].attachment.large_upload, true)
	assert.equal(calls[1].attachment.type, type)
	assert.deepEqual([puts[0][0], puts[0][2]], ["https://put", type])
})

test("guidance requires paginated, minimal list calls", async () => {
	const agents = readShipped("AGENTS.md")
	assert.match(agents, /`callApi` does not paginate/)
	assert.match(agents, /Always pass `limit`/)
	assert.match(agents, /`limit: 1` and read `meta.total`/)
	assert.match(agents, /Don't poll/)
	const guide = readShipped("skills/gxp-plugin/references/api-calls.md")
	assert.match(
		guide,
		/## List endpoints: paginate and request only what you need/,
	)
	assert.match(guide, /rejected with a 422/)
	assert.match(guide, /include: "attendee"/)
	assert.doesNotMatch(guide, /clamped, not rejected/)
	const result = await handleToolCall("describe_store_api", {})
	const { reference } = JSON.parse(
		result.content.map((block) => block.text || "").join(""),
	)
	assert.match(reference, /### List endpoints and pagination/)
	assert.match(reference, /fails with 422; it is not clamped/)
})
