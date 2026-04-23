/**
 * Tests for the MCP config-tools dispatcher. Uses a temp directory and the
 * real linter — no mocking of file IO, so we catch the pre-save validation
 * behavior end-to-end.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"

// eslint-disable-next-line no-undef
const {
	CONFIG_TOOLS,
	handleConfigToolCall,
	isConfigTool,
} = require("../../mcp/lib/config-tools")

function seed(tmp, config) {
	const p = path.join(tmp, "configuration.json")
	fs.writeFileSync(p, JSON.stringify(config, null, "\t"))
	return p
}

function baseConfig() {
	return {
		additionalTabs: [
			{
				type: "card_list",
				cards: [
					{
						type: "fields_list",
						title: "General",
						fieldsList: [{ type: "text", name: "username", label: "User" }],
					},
				],
			},
		],
	}
}

function parseResult(res) {
	return JSON.parse(res.content[0].text)
}

let tmp
beforeEach(() => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gxp-mcp-"))
})
afterEach(() => {
	fs.rmSync(tmp, { recursive: true, force: true })
})

describe("tool registry", () => {
	it("exposes at least the expected tool names", () => {
		const names = CONFIG_TOOLS.map((t) => t.name)
		for (const required of [
			"config_validate",
			"config_list_cards",
			"config_add_field",
			"config_move_field",
			"config_remove_field",
			"config_add_card",
			"config_remove_card",
			"config_get_field_schema",
		]) {
			expect(names).toContain(required)
			expect(isConfigTool(required)).toBe(true)
		}
	})
	it("rejects unknown tools", () => {
		expect(isConfigTool("nope_lol")).toBe(false)
	})
})

describe("config_validate", () => {
	it("returns ok=true for a valid file", async () => {
		const p = seed(tmp, baseConfig())
		const out = parseResult(
			await handleConfigToolCall("config_validate", { path: p }),
		)
		expect(out.ok).toBe(true)
	})

	it("returns errors for an invalid file", async () => {
		const bad = baseConfig()
		bad.additionalTabs[0].cards[0].fieldsList[0].type = "not-a-real-type"
		const p = seed(tmp, bad)
		const out = parseResult(
			await handleConfigToolCall("config_validate", { path: p }),
		)
		expect(out.ok).toBe(false)
		expect(out.errors.length).toBeGreaterThan(0)
	})
})

describe("config_list_field_types / list_card_types", () => {
	it("returns a non-empty list of field types", async () => {
		const out = parseResult(
			await handleConfigToolCall("config_list_field_types", {}),
		)
		expect(out.field_types).toContain("text")
		expect(out.field_types).toContain("select")
	})
	it("returns a non-empty list of card types", async () => {
		const out = parseResult(
			await handleConfigToolCall("config_list_card_types", {}),
		)
		expect(out.card_types).toContain("fields_list")
		expect(out.card_types).toContain("card_list")
	})
})

describe("config_get_field_schema", () => {
	it("reports conditional rules for select", async () => {
		const out = parseResult(
			await handleConfigToolCall("config_get_field_schema", {
				type: "select",
			}),
		)
		expect(out.type).toBe("select")
		// Select should inherit the "name required" rule and "options required" rule.
		const conditionals = JSON.stringify(out.conditional_rules)
		expect(conditionals).toMatch(/options/)
		expect(conditionals).toMatch(/name/)
	})

	it("rejects unknown types with a helpful error", async () => {
		const out = parseResult(
			await handleConfigToolCall("config_get_field_schema", {
				type: "nonsense",
			}),
		)
		expect(out.error).toMatch(/Unknown field type/)
		expect(out.valid_types).toContain("text")
	})
})

describe("config_list_cards / list_fields", () => {
	it("lists cards with paths", async () => {
		const p = seed(tmp, baseConfig())
		const out = parseResult(
			await handleConfigToolCall("config_list_cards", { path: p }),
		)
		expect(out.cards.length).toBeGreaterThan(0)
		expect(out.cards.some((c) => c.type === "fields_list")).toBe(true)
	})

	it("lists fields under a fields_list card", async () => {
		const p = seed(tmp, baseConfig())
		const out = parseResult(
			await handleConfigToolCall("config_list_fields", {
				path: p,
				card_path: "/additionalTabs/0/cards/0",
			}),
		)
		expect(out.fields).toHaveLength(1)
		expect(out.fields[0].name).toBe("username")
	})
})

describe("config_add_field", () => {
	it("adds a valid field and reports its new path", async () => {
		const p = seed(tmp, baseConfig())
		const out = parseResult(
			await handleConfigToolCall("config_add_field", {
				path: p,
				card_path: "/additionalTabs/0/cards/0",
				field: { type: "text", name: "email", label: "Email" },
			}),
		)
		expect(out.ok).toBe(true)
		expect(out.wrote).toBe(true)
		expect(out.field_path).toBe("/additionalTabs/0/cards/0/fieldsList/1")

		const saved = JSON.parse(fs.readFileSync(p, "utf-8"))
		expect(saved.additionalTabs[0].cards[0].fieldsList).toHaveLength(2)
	})

	it("refuses to save an invalid field and leaves the file untouched", async () => {
		const p = seed(tmp, baseConfig())
		const before = fs.readFileSync(p, "utf-8")
		const out = parseResult(
			await handleConfigToolCall("config_add_field", {
				path: p,
				card_path: "/additionalTabs/0/cards/0",
				// select with no options fails the conditional rule
				field: { type: "select", name: "role" },
			}),
		)
		expect(out.ok).toBe(false)
		expect(out.wrote).toBe(false)
		expect(out.errors.length).toBeGreaterThan(0)
		expect(fs.readFileSync(p, "utf-8")).toBe(before)
	})

	it("saves invalid content when force=true", async () => {
		const p = seed(tmp, baseConfig())
		const out = parseResult(
			await handleConfigToolCall("config_add_field", {
				path: p,
				card_path: "/additionalTabs/0/cards/0",
				field: { type: "select", name: "role" },
				force: true,
			}),
		)
		expect(out.wrote).toBe(true)
		expect(out.forced).toBe(true)
	})

	it("rejects a non-fields_list card", async () => {
		const p = seed(tmp, baseConfig())
		await expect(
			handleConfigToolCall("config_add_field", {
				path: p,
				card_path: "/additionalTabs/0",
				field: { type: "text", name: "x" },
			}),
		).rejects.toThrow(/fields_list/)
	})
})

describe("config_move_field", () => {
	it("moves a field and leaves the file valid", async () => {
		const cfg = baseConfig()
		cfg.additionalTabs[0].cards[0].fieldsList.push({
			type: "text",
			name: "email",
		})
		const p = seed(tmp, cfg)

		const out = parseResult(
			await handleConfigToolCall("config_move_field", {
				path: p,
				from_path: "/additionalTabs/0/cards/0/fieldsList/1",
				to_card_path: "/additionalTabs/0/cards/0",
				position: 0,
			}),
		)
		expect(out.ok).toBe(true)
		const saved = JSON.parse(fs.readFileSync(p, "utf-8"))
		expect(
			saved.additionalTabs[0].cards[0].fieldsList.map((f) => f.name),
		).toEqual(["email", "username"])
	})
})

describe("config_remove_field", () => {
	it("removes a field and keeps the file valid", async () => {
		const cfg = baseConfig()
		cfg.additionalTabs[0].cards[0].fieldsList.push({
			type: "text",
			name: "email",
		})
		const p = seed(tmp, cfg)

		const out = parseResult(
			await handleConfigToolCall("config_remove_field", {
				path: p,
				field_path: "/additionalTabs/0/cards/0/fieldsList/1",
			}),
		)
		expect(out.ok).toBe(true)
		expect(out.wrote).toBe(true)
		const saved = JSON.parse(fs.readFileSync(p, "utf-8"))
		expect(saved.additionalTabs[0].cards[0].fieldsList).toHaveLength(1)
	})
})

describe("config_add_card / remove_card", () => {
	it("appends a fields_list card and rolls back an invalid one", async () => {
		const p = seed(tmp, baseConfig())

		// Valid add
		const good = parseResult(
			await handleConfigToolCall("config_add_card", {
				path: p,
				parent_path: "/additionalTabs/0/cards",
				card: {
					type: "fields_list",
					title: "Extras",
					fieldsList: [],
				},
			}),
		)
		expect(good.ok).toBe(true)
		expect(good.card_path).toBe("/additionalTabs/0/cards/1")

		// Invalid: fields_list missing fieldsList entirely
		const before = fs.readFileSync(p, "utf-8")
		const bad = parseResult(
			await handleConfigToolCall("config_add_card", {
				path: p,
				parent_path: "/additionalTabs/0/cards",
				card: { type: "fields_list", title: "Broken" },
			}),
		)
		expect(bad.ok).toBe(false)
		expect(bad.wrote).toBe(false)
		expect(fs.readFileSync(p, "utf-8")).toBe(before)
	})

	it("removes a card", async () => {
		const p = seed(tmp, baseConfig())
		const out = parseResult(
			await handleConfigToolCall("config_remove_card", {
				path: p,
				card_path: "/additionalTabs/0/cards/0",
			}),
		)
		// Removing the only card of a card_list makes it invalid (minItems:1), so
		// we expect a rejected write — same protective behavior as add.
		expect(out.wrote).toBe(false)
		expect(out.ok).toBe(false)
	})
})
