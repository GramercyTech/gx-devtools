// @vitest-environment happy-dom
/**
 * Tests for the dev-server analytics plugin (runtime/gxpAnalyticsPlugin.js).
 *
 * Verifies the dev transport contract: events are broadcast on window as
 * `gxp:track` CustomEvents (never sent over the network) with the same
 * payload shape the platform plugin posts to the tracking endpoint.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { createApp, nextTick } from "vue"
import {
	createGxpAnalyticsPlugin,
	GXP_TRACK_WINDOW_EVENT,
} from "../../runtime/gxpAnalyticsPlugin.js"

let container
let app
let events
let trackListener

function mount(component, options = {}) {
	container = document.createElement("div")
	document.body.appendChild(container)
	app = createApp(component)
	app.use(createGxpAnalyticsPlugin(options))
	app.mount(container)
}

beforeEach(() => {
	events = []
	trackListener = (e) => events.push(e.detail)
	window.addEventListener(GXP_TRACK_WINDOW_EVENT, trackListener)
	vi.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(() => {
	window.removeEventListener(GXP_TRACK_WINDOW_EVENT, trackListener)
	if (app) app.unmount()
	if (container) container.remove()
	// NOTE: window._gxpTrackListenerActive / _gxpTrackLoggerActive guards are
	// intentionally left in place — window persists across tests in this file,
	// and deleting them would stack duplicate document/window listeners.
	delete window.gxp
	vi.restoreAllMocks()
})

describe("window.gxp.track", () => {
	it("broadcasts a custom event payload on window", () => {
		mount({ template: "<div />" }, { projectId: 42 })

		window.gxp.track("registration.started", { form_id: 123 })

		expect(events).toHaveLength(1)
		expect(events[0]).toEqual({
			event_type: "custom",
			event_name: "registration.started",
			project_id: 42,
			properties: { form_id: 123 },
		})
	})

	it("logs the payload to the console as JSON", () => {
		mount({ template: "<div />" })

		window.gxp.track("hello", {})

		const logged = console.log.mock.calls.find((args) =>
			String(args[0]).includes("[GxP Analytics]"),
		)
		expect(logged).toBeTruthy()
		expect(String(logged[0])).toContain('"event_name": "hello"')
	})
})

describe("v-gxp-track directive", () => {
	it("tracks clicks with element metadata", async () => {
		mount(
			{ template: `<button v-gxp-track="'cta.clicked'">Click Me</button>` },
			{ projectId: 7 },
		)
		await nextTick()

		container.querySelector("button").click()

		expect(events).toHaveLength(1)
		expect(events[0]).toMatchObject({
			event_type: "interaction",
			event_name: "cta.clicked",
			project_id: 7,
			properties: { element_tag: "button", element_text: "Click Me" },
		})
	})

	it("merges gxp-track-props JSON into properties", async () => {
		mount({
			template: `<button v-gxp-track="'cta.clicked'" gxp-track-props='{"placement":"hero"}'>Go</button>`,
		})
		await nextTick()

		container.querySelector("button").click()

		expect(events[0].properties.placement).toBe("hero")
	})
})

describe("raw gxp-track attribute (delegated listener)", () => {
	it("tracks clicks on plain-attribute elements", async () => {
		mount({ template: `<a gxp-track="link.clicked" href="#">A Link</a>` })
		await nextTick()

		container.querySelector("a").click()

		expect(events).toHaveLength(1)
		expect(events[0]).toMatchObject({
			event_type: "interaction",
			event_name: "link.clicked",
			properties: { element_tag: "a", element_text: "A Link" },
		})
	})

	it("does not double-fire for directive-bound elements", async () => {
		mount({
			template: `<button v-gxp-track="'once.only'" gxp-track="once.only">Once</button>`,
		})
		await nextTick()

		container.querySelector("button").click()

		expect(events).toHaveLength(1)
	})
})

describe("gxpTrack injection", () => {
	it("provides the track function to components", async () => {
		mount({
			inject: ["gxpTrack"],
			mounted() {
				this.gxpTrack("injected.event", { via: "inject" })
			},
			template: "<div />",
		})
		await nextTick()

		expect(events[0]).toMatchObject({
			event_type: "custom",
			event_name: "injected.event",
			properties: { via: "inject" },
		})
	})
})
