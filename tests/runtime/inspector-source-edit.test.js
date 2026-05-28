/**
 * Tests for the in-page inspector's source-editing primitives:
 *  - gxpSourceTrackerPlugin stamps data-gxp-loc with correct line/column
 *  - vite-inspector-plugin helpers used by POST /update-element
 *    (parseLoc, lineColToOffset, readOpeningTagAt, applyTagEdits, replaceLeafText)
 */
import { describe, it, expect } from "vitest"
import { gxpSourceTrackerPlugin } from "../../runtime/vite-source-tracker-plugin.js"
import {
	parseLoc,
	lineColToOffset,
	readOpeningTagAt,
	applyTagEdits,
	replaceLeafText,
} from "../../runtime/vite-inspector-plugin.js"

describe("gxpSourceTrackerPlugin data-gxp-loc stamping", () => {
	const plugin = gxpSourceTrackerPlugin()
	const id = `${process.cwd()}/src/Plugin.vue`

	it("stamps every element with file:line:col:tag pointing at the real source", () => {
		const code = `<template>\n\t<div>\n\t\t<h1>Hello</h1>\n\t</div>\n</template>\n`
		const result = plugin.transform(code, id)
		expect(result).toBeTruthy()

		// The <h1> opening tag is on line 3, indented by two tabs (column 3)
		expect(result.code).toContain('data-gxp-loc="src/Plugin.vue:3:3:h1"')
		// The <div> is on line 2, column 2
		expect(result.code).toContain('data-gxp-loc="src/Plugin.vue:2:2:div"')
	})

	it("skips script/style/template and leaves non-vue files alone", () => {
		expect(
			plugin.transform("console.log(1)", `${process.cwd()}/x.js`),
		).toBeNull()
	})
})

describe("parseLoc", () => {
	it("parses path:line:col:tag from the end (paths may contain colons)", () => {
		expect(parseLoc("src/Plugin.vue:12:4:h1")).toEqual({
			filePath: "src/Plugin.vue",
			line: 12,
			column: 4,
			tag: "h1",
		})
	})
	it("parses without a tag", () => {
		expect(parseLoc("src/a.vue:1:1")).toEqual({
			filePath: "src/a.vue",
			line: 1,
			column: 1,
			tag: null,
		})
	})
	it("returns null for garbage", () => {
		expect(parseLoc("nope")).toBeNull()
		expect(parseLoc(null)).toBeNull()
	})
})

describe("lineColToOffset + readOpeningTagAt", () => {
	const file = `<template>\n\t<h1 class="a">Hi</h1>\n</template>\n`
	it("resolves a line/col to the opening tag", () => {
		// <h1> is line 2, column 2
		const offset = lineColToOffset(file, 2, 2)
		expect(file[offset]).toBe("<")
		const tag = readOpeningTagAt(file, offset)
		expect(tag.tagName).toBe("h1")
		expect(tag.text).toBe('<h1 class="a">')
		expect(tag.selfClosing).toBe(false)
	})
	it("respects quoted > inside attribute values", () => {
		const content = `<img alt="a > b" src="x" />`
		const tag = readOpeningTagAt(content, 0)
		expect(tag.tagName).toBe("img")
		expect(tag.selfClosing).toBe(true)
		expect(tag.text).toBe(`<img alt="a > b" src="x" />`)
	})
})

describe("applyTagEdits", () => {
	it("sets class and style, preserving existing attributes", () => {
		const out = applyTagEdits('<h1 id="x" class="old">', {
			set: { class: "new big", style: "color: red" },
		})
		expect(out).toBe('<h1 id="x" class="new big" style="color: red">')
	})
	it("adds and removes arbitrary attributes", () => {
		const out = applyTagEdits('<h1 class="a" data-foo="1">', {
			set: { attrs: { "gxp-string": "welcome" } },
			remove: ["data-foo"],
		})
		expect(out).toBe('<h1 class="a" gxp-string="welcome">')
	})
	it("removes class when set to empty string", () => {
		expect(applyTagEdits('<h1 class="a">', { set: { class: "" } })).toBe("<h1>")
	})
	it("keeps self-closing form", () => {
		const out = applyTagEdits('<img src="a" />', {
			set: { attrs: { "gxp-src": "hero" } },
		})
		expect(out).toBe('<img src="a" gxp-src="hero" />')
	})
})

describe("replaceLeafText", () => {
	it("replaces inner text up to the next tag, preserving whitespace", () => {
		const content = `<h1>\n\t\tHello\n\t</h1>`
		const from = content.indexOf(">") + 1
		const { content: updated, applied } = replaceLeafText(
			content,
			from,
			"Goodbye",
		)
		expect(applied).toBe(true)
		expect(updated).toBe(`<h1>\n\t\tGoodbye\n\t</h1>`)
	})
	it("escapes angle brackets in new text", () => {
		const content = `<h1>x</h1>`
		const from = content.indexOf(">") + 1
		const { content: updated } = replaceLeafText(content, from, "a<b")
		expect(updated).toContain("a&lt;b")
	})
})
