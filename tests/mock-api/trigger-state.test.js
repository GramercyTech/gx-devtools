import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import express from "express"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const {
	createTriggerStateRouter,
} = require("../../runtime/mock-api/trigger-state.js")

describe("trigger-state mock (EZ-3312)", () => {
	let server
	let base
	let io

	beforeEach(async () => {
		const projectRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "gx-trigger-state-"),
		)
		fs.writeFileSync(
			path.join(projectRoot, "app-manifest.json"),
			JSON.stringify({
				triggerState: { slide: 1, overlay: { color: "blue", text: "Hi" } },
				widgetStates: { jukebox: { id: 5, state: { now_playing: "Song" } } },
			}),
		)
		io = { emit: vi.fn() }
		const app = express()
		app.use("/api", createTriggerStateRouter(io, { projectRoot }))
		server = await new Promise((resolve) => {
			const s = app.listen(0, () => resolve(s))
		})
		base = `http://127.0.0.1:${server.address().port}/api/v1/projects/t/p/trigger-state`
	})

	afterEach(() => server.close())

	const patch = (target, state) =>
		fetch(`${base}/${target}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ state }),
		})

	it("starts self from the manifest's triggerState and widgets from widgetStates", async () => {
		expect((await (await fetch(`${base}/self`)).json()).state.slide).toBe(1)
		expect((await (await fetch(`${base}/widget:5`)).json()).state).toEqual({
			now_playing: "Song",
		})
	})

	it("removes a key sent as null and replaces nested values whole, then relays the change", async () => {
		const response = await patch("self", {
			slide: null,
			overlay: { color: "red" },
		})

		expect(response.status).toBe(200)
		expect((await response.json()).state).toEqual({ overlay: { color: "red" } })
		expect(io.emit).toHaveBeenCalledWith(
			"state-change",
			expect.objectContaining({
				changes: { slide: null, overlay: { color: "red" } },
			}),
		)
	})

	it("relays widget changes with the widget's id", async () => {
		await patch("widget:5", { now_playing: "Next" })

		expect(io.emit).toHaveBeenCalledWith(
			"widget-state-change",
			expect.objectContaining({
				project_portal_widget_id: 5,
				changes: { now_playing: "Next" },
			}),
		)
	})

	it("refuses gxp_ keys and keys that aren't plain names", async () => {
		const reserved = await patch("self", { gxp_mode: 1 })
		const dotted = await patch("self", { "a.b": 1 })

		expect(reserved.status).toBe(422)
		expect((await reserved.json()).errors.state[0]).toBe(
			"These keys are reserved: gxp_mode.",
		)
		expect(dotted.status).toBe(422)
	})
})
