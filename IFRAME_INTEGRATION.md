# Embedding the GxP Inspector in an iframe

The GxP dev toolkit ships an **in-page element inspector** (no browser extension
required). When a plugin runs in the dev server, a floating dev-tools button in
the bottom-right corner exposes three actions on hover:

- **Config Editor** — the existing dev-tools modal (store, layouts, sockets, mock data)
- **Select** — pick an element to inspect/edit (text, classes, style, attributes) and
  extract it to a GxP directive (`gxp-string` / `gxp-src`)
- **Locate** — pick an element and **broadcast its source location** instead of opening it

This document is for **platform developers** who load a plugin inside an `<iframe>`
(e.g. a preview pane in the GXP dashboard) and want to:

- react when a developer clicks "Locate" / "Open in source" (the broadcast contract below), and/or
- **replace the injected menu entirely** and drive the dev tools from your own host UI
  (see [Embedded mode](#embedded-mode-driving-the-dev-tools-from-your-host-menu)).

When the plugin detects it is running in an iframe, the floating circle/ribbon menu
is hidden automatically and the host takes over via `postMessage`.

---

## The broadcast contract

Whenever a source location is broadcast (Locate-mode click, or the **Open in source**
button in the element editor), the inspector emits the **same payload** on three
channels so it is reachable in any embedding scenario:

1. `window.dispatchEvent(new CustomEvent("gxp:open-in-source", { detail: payload }))` — same document
2. `window.postMessage(payload, "*")` — the plugin window itself
3. `window.parent.postMessage(payload, "*")` — **the iframe-embedding host page**

As the host page, you listen on `message`:

```js
window.addEventListener("message", (event) => {
	const data = event.data
	if (!data || data.type !== "gxp:open-in-source") return

	// OPTIONAL but recommended: verify the sender is your plugin iframe
	// if (event.origin !== "https://localhost:3060") return

	console.log("Open in source:", data)
	// → wire this to your editor / file panel / etc.
})
```

### Payload shape

```ts
interface GxpOpenInSourcePayload {
	type: "gxp:open-in-source"
	file: string | null // e.g. "src/Plugin.vue" (relative to the plugin project root)
	line: number | null // 1-based
	column: number | null // 1-based
	loc: string | null // raw data-gxp-loc value, "src/Plugin.vue:12:4:h1"
	component: string | null // nearest Vue component name, e.g. "Plugin"
	tag: string // element tag, e.g. "h1"
	gxpKey: string | null // gxp-string / gxp-src key if the element already has one
	expr: string | null // template expression if the element is dynamic ({{ ... }})
}
```

`file`, `line`, and `column` are derived from the `data-gxp-loc` attribute that the
dev server stamps on every element at compile time (see "How locations are produced"
below). If an element has no stamped location (rare — e.g. injected at runtime),
`file`/`line`/`column` are `null` but the rest of the payload is still useful.

---

## Minimal host-page example

```html
<iframe id="plugin" src="https://localhost:3060"></iframe>

<script>
	window.addEventListener("message", (event) => {
		const data = event.data
		if (data?.type !== "gxp:open-in-source") return

		if (data.file && data.line != null) {
			// Example: hand off to your own editor integration
			myEditor.open(data.file, data.line, data.column ?? 1)
		} else {
			console.warn("Element had no source location", data)
		}
	})
</script>
```

Because the inspector also calls `window.postMessage` on its **own** window, the
contract works identically whether the plugin is embedded in an iframe or opened
directly in a tab — useful for local testing without an embedding host.

---

## Embedded mode: driving the dev tools from your host menu

When the plugin runs **inside an iframe**, it auto-detects the embedded context
(`window.self !== window.top`) and **hides the injected floating circle/ribbon menu
and the in-iframe editor modal**. All the underlying functionality stays active and
is driven by your host page over `postMessage` — so you can build the dev-tools menu
natively in the platform and style it however you like.

Standalone (opened directly, not in an iframe) the local floating menu still appears
as normal. You can force the mode for testing with `?gxp-embedded=1` (embedded) or
`?gxp-embedded=0` (standalone) on the plugin URL.

### Command / response / event protocol

All messages are namespaced. Your host sends **commands** and receives **responses**
plus unsolicited **events**:

```ts
// host → plugin
{ source: "gxp-host", type: "command", id: string, action: string, payload?: any }
// plugin → host
{ source: "gxp-devtools", type: "response", id: string, ok: boolean, result?: any, error?: string }
{ source: "gxp-devtools", type: "event", event: string, payload: any }
```

A tiny host-side client:

```js
const iframe = document.getElementById("plugin")

function command(action, payload) {
	return new Promise((resolve, reject) => {
		const id = String(Math.random())
		function onMessage(e) {
			const d = e.data
			if (d?.source !== "gxp-devtools" || d.type !== "response" || d.id !== id)
				return
			window.removeEventListener("message", onMessage)
			d.ok ? resolve(d.result) : reject(new Error(d.error))
		}
		window.addEventListener("message", onMessage)
		iframe.contentWindow.postMessage(
			{ source: "gxp-host", type: "command", id, action, payload },
			"*", // or your plugin origin
		)
	})
}

// listen for events the plugin pushes on its own
window.addEventListener("message", (e) => {
	const d = e.data
	if (d?.source !== "gxp-devtools" || d.type !== "event") return
	if (d.event === "element-selected") openYourEditor(d.payload)
})

// examples
await command("select") // enter element-select mode
await command("setLayout", { layout: "private" })
const tree = await command("getComponentTree") // [{ name, depth, loc }]
const store = await command("getStore") // serializable store snapshot
```

### Actions

| Action                       | Payload                               | Result / effect                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ping`                       | —                                     | `{ embedded, mode }`                                                                                                                                                                             |
| `setMode`                    | `{ mode: "off"\|"select"\|"locate" }` | enters/leaves a mode → `{ mode }`                                                                                                                                                                |
| `select`                     | —                                     | shorthand for `setMode({mode:"select"})`                                                                                                                                                         |
| `locate`                     | —                                     | shorthand for `setMode({mode:"locate"})`                                                                                                                                                         |
| `exit`                       | —                                     | leaves inspection                                                                                                                                                                                |
| `describeSelection`          | —                                     | full description of the current selection (or `null`)                                                                                                                                            |
| `highlight`                  | `{ loc }`                             | highlight + select the element at a `data-gxp-loc`                                                                                                                                               |
| `clearHighlight`             | —                                     | clear the selection highlight                                                                                                                                                                    |
| `getComponentTree`           | —                                     | flat `[{ name, depth, loc }]` component tree                                                                                                                                                     |
| `getLayouts`                 | —                                     | `["public","private","system"]`                                                                                                                                                                  |
| `getLayout`                  | —                                     | current layout name                                                                                                                                                                              |
| `setLayout`                  | `{ layout }`                          | switch layout → `{ layout }`                                                                                                                                                                     |
| `openConfig` / `closeConfig` | —                                     | show/hide the built-in config modal (optional)                                                                                                                                                   |
| `getStore`                   | —                                     | snapshot of all store sections                                                                                                                                                                   |
| `getState`                   | `{ key, fallback }`                   | a single `triggerState` value                                                                                                                                                                    |
| `setState`                   | `{ key, value }`                      | write a `triggerState` value                                                                                                                                                                     |
| `setStoreValue`              | `{ section, key, value }`             | write a value into an object-shaped store section (runtime-only, not persisted). Sections: `pluginVars`, `stringsList`, `assetList`, `triggerState`, `dependencyList`. Returns `{ ok, error? }`. |
| `api`                        | `{ method?, endpoint, body? }`        | proxy a call to `/__gxp-inspector/*` (e.g. `update-element`)                                                                                                                                     |

The `api` proxy lets the host perform source edits/extraction through the same
channel — e.g. to persist an edit after building your own editor from an
`element-selected` event:

```js
await command("api", {
	endpoint: "/update-element",
	body: { loc: payload.loc, set: { class: "headline lg" } },
})
```

### Events

| Event              | Payload                              | When                                         |
| ------------------ | ------------------------------------ | -------------------------------------------- |
| `ready`            | `{ actions: string[] }`              | bridge initialized (lists supported actions) |
| `mode-changed`     | `{ mode }`                           | inspector mode changed                       |
| `element-selected` | full element description (see below) | an element was selected in Select mode       |
| `open-in-source`   | the `gxp:open-in-source` payload     | Locate-mode click / Open-in-source button    |

The `element-selected` payload is everything needed to render your own editor:

```ts
{
	// ...all gxp:open-in-source fields (file, line, column, loc, component, tag, gxpKey, expr)
	classes: string
	style: string
	text: string | null // null when the element has child elements
	canEditText: boolean
	attrs: Record<string, string>
	props: Record<string, any> // nearest Vue component props
	state: Record<string, any> // nearest component reactive state
}
```

---

## Security note: target origin

For dev ergonomics the inspector currently broadcasts with `postMessage(payload, "*")`,
matching the dev server's permissive CORS. This is fine for local development.

If you need to lock this down (e.g. a hosted preview environment), two layers apply:

- **Host side (recommended now):** always check `event.origin` against your known
  plugin dev-server origin before trusting a message, as shown above.
- **Plugin side (future):** the broadcast helper accepts a configurable
  `targetOrigin`. It is wired through the inspector components as the `targetOrigin`
  prop / `targetOrigin` option (default `"*"`); a follow-up can surface this via an
  env var (e.g. `GXP_HOST_ORIGIN`) so the plugin only posts to your host.

---

## How locations are produced

In `serve` mode the `gxp-source-tracker` Vite plugin
(`runtime/vite-source-tracker-plugin.js`) stamps every element opening tag with:

```html
<h1 data-gxp-loc="src/Plugin.vue:12:4:h1">Hello</h1>
```

The format is `file:line:column:tag` (the file path may itself contain `:`, so
parsers read `tag`, `column`, and `line` from the **end**). The inspector reads this
attribute to build the broadcast payload and to drive source edits via the dev
server API (`POST /__gxp-inspector/update-element`).

Stamping can be disabled with `DISABLE_SOURCE_TRACKER=true` (this also disables
`data-gxp-expr`). Locations are **dev-only** and are not present in production builds.

---

## Programmatic control (optional)

The inspector is also reachable from the plugin window console / scripts via the
`window.gxDevTools` API:

```js
window.gxDevTools.toggleSelect() // toggle Select mode
window.gxDevTools.toggleLocate() // toggle Locate mode
window.gxDevTools.inspectorMode() // "off" | "select" | "locate"
```

Keyboard: **Ctrl/Cmd + Shift + I** toggles Select mode; **Esc** cancels.

---

## Quick checklist for host integration

1. Embed the plugin dev server (`https://localhost:3060` by default) in an `<iframe>`.
2. Add a `message` listener filtering on `type === "gxp:open-in-source"`.
3. Verify `event.origin` matches your plugin origin.
4. Use `file` + `line` + `column` to drive your editor / file panel.
5. Handle the `file === null` case (element without a stamped source location).
