/**
 * Tests for pure JSON-pointer + card-walking helpers used by MCP config tools.
 */
import { describe, it, expect } from "vitest"

// eslint-disable-next-line no-undef
const {
	parsePointer,
	buildPointer,
	getByPointer,
	setByPointer,
	deleteByPointer,
	insertAt,
	moveItem,
	listCards,
	listFields,
} = require("../../mcp/lib/config-ops")

function sampleDoc() {
	return {
		additionalTabs: [
			{
				type: "card_list",
				cards: [
					{
						type: "fields_list",
						title: "General",
						fieldsList: [
							{ type: "text", name: "username" },
							{ type: "text", name: "email" },
						],
					},
					{
						type: "tabs_list",
						tabsList: [
							{
								title: "Advanced",
								cards: [
									{
										type: "fields_list",
										title: "Secrets",
										fieldsList: [{ type: "password", name: "token" }],
									},
								],
							},
						],
					},
				],
			},
		],
	}
}

describe("pointer parsing", () => {
	it("treats empty string and '/' as root", () => {
		expect(parsePointer("")).toEqual([])
		expect(parsePointer("/")).toEqual([])
	})
	it("splits nested pointers", () => {
		expect(parsePointer("/additionalTabs/0/cards/1")).toEqual([
			"additionalTabs",
			"0",
			"cards",
			"1",
		])
	})
	it("roundtrips through buildPointer", () => {
		const p = "/additionalTabs/0/cards/1/fieldsList/2"
		expect(buildPointer(parsePointer(p))).toBe(p)
	})
})

describe("getByPointer", () => {
	it("returns the whole doc for empty pointer", () => {
		const d = sampleDoc()
		expect(getByPointer(d, "")).toBe(d)
	})
	it("navigates objects and arrays", () => {
		const d = sampleDoc()
		expect(getByPointer(d, "/additionalTabs/0/cards/0/fieldsList/1/name")).toBe(
			"email",
		)
	})
	it("returns undefined for missing paths", () => {
		expect(getByPointer(sampleDoc(), "/nope/42/nada")).toBeUndefined()
	})
})

describe("setByPointer", () => {
	it("is immutable — input is unchanged", () => {
		const d = sampleDoc()
		const before = JSON.stringify(d)
		setByPointer(d, "/additionalTabs/0/cards/0/title", "Renamed")
		expect(JSON.stringify(d)).toBe(before)
	})
	it("updates the value", () => {
		const d = sampleDoc()
		const next = setByPointer(d, "/additionalTabs/0/cards/0/title", "Renamed")
		expect(next.additionalTabs[0].cards[0].title).toBe("Renamed")
	})
	it("throws on missing parent", () => {
		expect(() => setByPointer(sampleDoc(), "/nope/x/y", 1)).toThrow(
			/Path does not exist/,
		)
	})
})

describe("deleteByPointer", () => {
	it("splices arrays", () => {
		const d = sampleDoc()
		const next = deleteByPointer(d, "/additionalTabs/0/cards/0/fieldsList/0")
		expect(next.additionalTabs[0].cards[0].fieldsList).toHaveLength(1)
		expect(next.additionalTabs[0].cards[0].fieldsList[0].name).toBe("email")
	})
	it("deletes object keys", () => {
		const d = sampleDoc()
		const next = deleteByPointer(d, "/additionalTabs/0/cards/0/title")
		expect(next.additionalTabs[0].cards[0]).not.toHaveProperty("title")
	})
	it("refuses to delete root", () => {
		expect(() => deleteByPointer(sampleDoc(), "")).toThrow()
	})
})

describe("insertAt", () => {
	it("appends by default", () => {
		const d = sampleDoc()
		const { doc, index } = insertAt(d, "/additionalTabs/0/cards/0/fieldsList", {
			type: "text",
			name: "added",
		})
		expect(index).toBe(2)
		expect(doc.additionalTabs[0].cards[0].fieldsList[2].name).toBe("added")
	})
	it("inserts at a specific position", () => {
		const d = sampleDoc()
		const { doc, index } = insertAt(
			d,
			"/additionalTabs/0/cards/0/fieldsList",
			{ type: "text", name: "at-front" },
			0,
		)
		expect(index).toBe(0)
		expect(doc.additionalTabs[0].cards[0].fieldsList[0].name).toBe("at-front")
	})
	it("rejects invalid positions", () => {
		const d = sampleDoc()
		expect(() =>
			insertAt(d, "/additionalTabs/0/cards/0/fieldsList", {}, -1),
		).toThrow(/Invalid position/)
	})
})

describe("moveItem", () => {
	it("moves a field within the same list", () => {
		const d = sampleDoc()
		const { doc } = moveItem(
			d,
			"/additionalTabs/0/cards/0/fieldsList/1",
			"/additionalTabs/0/cards/0/fieldsList",
			0,
		)
		const names = doc.additionalTabs[0].cards[0].fieldsList.map((f) => f.name)
		expect(names).toEqual(["email", "username"])
	})
	it("moves a field between cards", () => {
		const d = sampleDoc()
		const { doc } = moveItem(
			d,
			"/additionalTabs/0/cards/0/fieldsList/0",
			"/additionalTabs/0/cards/1/tabsList/0/cards/0/fieldsList",
		)
		expect(
			doc.additionalTabs[0].cards[1].tabsList[0].cards[0].fieldsList.map(
				(f) => f.name,
			),
		).toEqual(["token", "username"])
		expect(doc.additionalTabs[0].cards[0].fieldsList).toHaveLength(1)
	})
})

describe("listCards", () => {
	it("walks tabs_list + card_list recursively", () => {
		const d = sampleDoc()
		const cards = listCards(d)
		const paths = cards.map((c) => c.path)
		expect(paths).toContain("/additionalTabs/0")
		expect(paths).toContain("/additionalTabs/0/cards/0")
		expect(paths).toContain("/additionalTabs/0/cards/1")
		expect(paths).toContain("/additionalTabs/0/cards/1/tabsList/0/cards/0")
	})
	it("reports field counts for fields_list cards", () => {
		const cards = listCards(sampleDoc())
		const generalCard = cards.find((c) => c.title === "General")
		expect(generalCard.fieldCount).toBe(2)
	})
})

describe("listFields", () => {
	it("returns fields under the given card_path", () => {
		const d = sampleDoc()
		const fields = listFields(d, "/additionalTabs/0/cards/0")
		expect(fields).toEqual([
			{
				path: "/additionalTabs/0/cards/0/fieldsList/0",
				type: "text",
				name: "username",
				label: null,
			},
			{
				path: "/additionalTabs/0/cards/0/fieldsList/1",
				type: "text",
				name: "email",
				label: null,
			},
		])
	})
	it("returns [] for non-fields_list cards", () => {
		expect(listFields(sampleDoc(), "/additionalTabs/0/cards/1")).toEqual([])
	})
})
