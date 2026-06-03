/**
 * Regression tests for searchEvents (search_websocket_events) and the shared
 * normalizeOperationId helper. A spec whose `x-triggered-by` is an array (or
 * any non-string) used to crash with `trigger.toLowerCase is not a function`.
 */
import { describe, it, expect } from "vitest"

// eslint-disable-next-line no-undef
const { searchEvents } = require("../../mcp/lib/server")
// eslint-disable-next-line no-undef
const { normalizeOperationId } = require("../../mcp/lib/api-tools")

const specWith = (messages) => ({ components: { messages } })

describe("searchEvents x-triggered-by handling", () => {
	it("does not crash when x-triggered-by is an array, and matches on its entries", () => {
		const spec = specWith({
			PhotoSubmitted: {
				summary: "A photo was submitted",
				"x-triggered-by": ["portal.v1.project.submitPhoto", "uploadAsset"],
			},
		})

		// The crashing call: query matches one of the array triggers.
		const results = searchEvents(spec, "uploadAsset")
		expect(results).toHaveLength(1)
		expect(results[0].eventName).toBe("PhotoSubmitted")
		// Raw value preserved in the output.
		expect(results[0].triggeredBy).toEqual([
			"portal.v1.project.submitPhoto",
			"uploadAsset",
		])
	})

	it("tolerates a non-string, non-array x-triggered-by without throwing", () => {
		const spec = specWith({
			Weird: { summary: "weird trigger", "x-triggered-by": { op: "x" } },
		})
		expect(() => searchEvents(spec, "weird")).not.toThrow()
		const results = searchEvents(spec, "weird")
		expect(results).toHaveLength(1)
	})

	it("still matches a plain string trigger", () => {
		const spec = specWith({
			Created: { summary: "", "x-triggered-by": "createThing" },
		})
		const results = searchEvents(spec, "creatething")
		expect(results).toHaveLength(1)
		expect(results[0].triggeredBy).toBe("createThing")
	})

	it("omits triggeredBy as null when absent", () => {
		const spec = specWith({ Plain: { summary: "plain event" } })
		const results = searchEvents(spec, "plain")
		expect(results[0].triggeredBy).toBeNull()
	})
})

describe("normalizeOperationId", () => {
	it("strips the portal prefix from a string id", () => {
		expect(normalizeOperationId("portal.v1.project.doThing")).toBe("doThing")
	})

	it("returns non-string ids untouched instead of throwing", () => {
		const arr = ["a", "b"]
		expect(() => normalizeOperationId(arr)).not.toThrow()
		expect(normalizeOperationId(arr)).toBe(arr)
		expect(normalizeOperationId(null)).toBeNull()
	})
})
