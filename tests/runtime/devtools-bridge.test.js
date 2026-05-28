/**
 * Tests for the embedded-mode host bridge:
 *  - isEmbedded() iframe detection + query override
 *  - createDevtoolsBridge() command/response/event protocol
 *
 * A fake window is injected so the postMessage protocol can be exercised in
 * the node test environment.
 */
import { describe, it, expect } from "vitest"
import {
	isEmbedded,
	createDevtoolsBridge,
} from "../../runtime/dev-tools/devtools-bridge.js"

function makeWin({ self, top, search = "" } = {}) {
	const listeners = {}
	const posted = []
	const win = {
		location: { search },
		addEventListener: (t, fn) => {
			;(listeners[t] ||= []).push(fn)
		},
		removeEventListener: (t, fn) => {
			listeners[t] = (listeners[t] || []).filter((f) => f !== fn)
		},
		postMessage: (msg) => posted.push(msg),
		_listeners: listeners,
		_posted: posted,
		fire: (t, ev) => (listeners[t] || []).slice().forEach((fn) => fn(ev)),
	}
	win.self = self === undefined ? win : self
	win.top = top === undefined ? win : top
	win.parent = { postMessage: (msg) => posted.push(msg) }
	return win
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe("isEmbedded", () => {
	it("is false at top level (self === top)", () => {
		const win = makeWin()
		expect(isEmbedded(win)).toBe(false)
	})
	it("is true inside an iframe (self !== top)", () => {
		const win = makeWin({})
		win.top = {} // distinct from self
		expect(isEmbedded(win)).toBe(true)
	})
	it("honors ?gxp-embedded=1 / =0 override", () => {
		expect(isEmbedded(makeWin({ search: "?gxp-embedded=1" }))).toBe(true)
		const framed = makeWin({ search: "?gxp-embedded=0" })
		framed.top = {}
		expect(isEmbedded(framed)).toBe(false)
	})
})

describe("createDevtoolsBridge", () => {
	it("announces a ready event with the supported actions", () => {
		const win = makeWin()
		createDevtoolsBridge({ handlers: { foo: () => 1 }, win })
		const ready = win._posted.find(
			(m) => m.type === "event" && m.event === "ready",
		)
		expect(ready).toBeTruthy()
		expect(ready.source).toBe("gxp-devtools")
		expect(ready.payload.actions).toContain("foo")
	})

	it("runs a handler and replies with the result", async () => {
		const win = makeWin()
		createDevtoolsBridge({ handlers: { echo: (p) => ({ got: p }) }, win })
		win.fire("message", {
			data: {
				source: "gxp-host",
				type: "command",
				id: "1",
				action: "echo",
				payload: 42,
			},
		})
		await flush()
		const res = win._posted.find((m) => m.type === "response" && m.id === "1")
		expect(res).toEqual({
			source: "gxp-devtools",
			type: "response",
			id: "1",
			ok: true,
			result: { got: 42 },
		})
	})

	it("reports unknown actions", async () => {
		const win = makeWin()
		createDevtoolsBridge({ handlers: {}, win })
		win.fire("message", {
			data: { source: "gxp-host", type: "command", id: "2", action: "nope" },
		})
		await flush()
		const res = win._posted.find((m) => m.type === "response" && m.id === "2")
		expect(res.ok).toBe(false)
		expect(res.error).toMatch(/Unknown action/)
	})

	it("captures handler errors", async () => {
		const win = makeWin()
		createDevtoolsBridge({
			handlers: {
				boom: () => {
					throw new Error("kaboom")
				},
			},
			win,
		})
		win.fire("message", {
			data: { source: "gxp-host", type: "command", id: "3", action: "boom" },
		})
		await flush()
		const res = win._posted.find((m) => m.type === "response" && m.id === "3")
		expect(res.ok).toBe(false)
		expect(res.error).toBe("kaboom")
	})

	it("ignores messages that are not host commands", async () => {
		const win = makeWin()
		createDevtoolsBridge({ handlers: { echo: () => 1 }, win })
		const before = win._posted.length
		win.fire("message", {
			data: { source: "somethingelse", type: "command", action: "echo" },
		})
		win.fire("message", { data: { source: "gxp-host", type: "event" } })
		await flush()
		expect(win._posted.length).toBe(before)
	})

	it("stops listening after destroy", async () => {
		const win = makeWin()
		const bridge = createDevtoolsBridge({ handlers: { echo: () => 1 }, win })
		bridge.destroy()
		const before = win._posted.length
		win.fire("message", {
			data: { source: "gxp-host", type: "command", id: "9", action: "echo" },
		})
		await flush()
		expect(win._posted.length).toBe(before)
	})
})
