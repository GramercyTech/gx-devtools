---
sidebar_position: 10
title: GxP Analytics Plugin
description: gxp-track directive and window.gxp.track() for analytics event tracking
---

# GxP Analytics Plugin

The GxP Analytics Plugin provides declarative click tracking and a custom event API for reporting analytics from your plugin. The platform auto-installs it in production; the GxP Toolkit ships a dev-server version with the identical API so you can wire up and verify tracking during development.

## Overview

The plugin provides three ways to track events:

| API                   | Use for                                   |
| --------------------- | ----------------------------------------- |
| `gxp-track` attribute | Declarative click tracking on any element |
| `window.gxp.track()`  | Custom events from any JS context         |
| `inject("gxpTrack")`  | Custom events from inside Vue components  |

## Dev vs. Production Behavior

The API is identical in both environments — only the transport differs:

| Environment    | What happens on a tracked event                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------- |
| **Production** | Payload is POSTed to the platform tracking endpoint via `navigator.sendBeacon` (fetch fallback) |
| **Dev server** | Payload is broadcast on `window` as a `gxp:track` CustomEvent and logged to the console as JSON |

Nothing ever hits production analytics from the dev server — develop and click freely.

## Declarative Click Tracking (gxp-track)

Add the `gxp-track` attribute to any element. Clicks send an `interaction` event named by the attribute value:

```html
<button gxp-track="registration.submit" gxp-string="btn_submit">Submit</button>

<a gxp-track="sponsor.banner.clicked" href="/sponsor">Visit our sponsor</a>
```

A click on the button above produces:

```json
{
	"event_type": "interaction",
	"event_name": "registration.submit",
	"project_id": 42,
	"properties": {
		"element_tag": "button",
		"element_text": "Submit"
	}
}
```

`element_text` is the element's trimmed text content, capped at 100 characters.

### Extra Properties (gxp-track-props)

Attach additional properties as a JSON attribute. They are merged into `properties`:

```html
<button
	gxp-track="cta.clicked"
	gxp-track-props='{"placement": "hero", "variant": "primary"}'
>
	Get Started
</button>
```

Invalid JSON in `gxp-track-props` is silently ignored (the event still fires with the default properties).

For dynamic values, bind the attribute with Vue:

```html
<button
	gxp-track="session.join"
	:gxp-track-props="JSON.stringify({ session_id: session.id })"
	gxp-string="btn_join"
>
	Join Session
</button>
```

### Directive vs. Attribute Syntax

Like `gxp-string`, both forms work:

```html
<!-- Attribute syntax (recommended) -->
<button gxp-track="cta.clicked">Go</button>

<!-- Vue directive syntax -->
<button v-gxp-track="'cta.clicked'">Go</button>
```

The raw attribute is handled by a delegated document listener, so it also works on server-rendered HTML and content outside Vue's render tree. Elements bound via the Vue directive are excluded from the delegated listener, so events never double-fire.

## Custom Events

### window.gxp.track()

Available from any JS context once the plugin is installed:

```javascript
window.gxp.track("registration.started", { form_id: 123 })
```

Produces:

```json
{
	"event_type": "custom",
	"event_name": "registration.started",
	"project_id": 42,
	"properties": { "form_id": 123 }
}
```

### Vue Injection

Inside components, prefer the injected function:

```vue
<script setup>
import { inject } from "vue"

const track = inject("gxpTrack")

function onCheckinComplete(attendee) {
	track("checkin.completed", { attendee_id: attendee.id })
}
</script>
```

## Observing Events in Development

### Console

Every event is logged to the browser console as pretty-printed JSON:

```
[GxP Analytics] track event:
{
  "event_type": "interaction",
  "event_name": "cta.clicked",
  "project_id": null,
  "properties": { ... }
}
```

### Window Event

Subscribe programmatically (e.g. in tests or custom dev tooling):

```javascript
window.addEventListener("gxp:track", (e) => {
	console.log("tracked:", e.detail) // the full payload object
})
```

The event name is exported as a constant:

```javascript
import { GXP_TRACK_WINDOW_EVENT } from "@gx-runtime/gxpAnalyticsPlugin.js"
```

## Event Payload Reference

| Field        | Type                 | Description                                                          |
| ------------ | -------------------- | -------------------------------------------------------------------- |
| `event_type` | string               | `"interaction"` for `gxp-track` clicks, `"custom"` for `gxp.track()` |
| `event_name` | string               | The `gxp-track` value or the first argument to `track()`             |
| `project_id` | number\|string\|null | GXP project ID (from `API_PROJECT_ID` in `.env` on the dev server)   |
| `properties` | object               | Element metadata (interactions) merged with custom props             |

## Declaring Events in the App Manifest

Every tracked event should be declared in `app-manifest.json` under the `track-events` key so the platform can build reporting around it. Keys are event identifiers; values describe the root keys of the event's `gxp-track-props` (or `track()` properties):

```json
{
	"track-events": {
		"cta.clicked": {
			"placement": "string",
			"variant": ["primary", "secondary"]
		},
		"session.join": {
			"session_id": { "type": "session", "value": "id" }
		}
	}
}
```

Each prop value is `"string"` (free-form), an array of allowed values, or a `{ "type": ..., "value": ... }` relationship object pointing at a platform model field (e.g. `{ "type": "attendee", "value": "id" }`).

You don't need to write this by hand: `gxdev extract-config` (or the `config_extract_strings` MCP tool, or `/extract-config` in the TUI) scans `src/` for `gxp-track` attributes and `gxp.track()`/`gxpTrack()` calls and seeds `track-events` automatically. Every extracted prop defaults to `"string"` — refine to allowed-value lists or relationship objects by hand; re-extraction never overwrites an existing definition. See the [App Manifest docs](./app-manifest.md) for the full reference.

## Configuration

The dev harness installs the plugin automatically. Environment variables (`.env`):

| Variable            | Effect                                                       |
| ------------------- | ------------------------------------------------------------ |
| `API_PROJECT_ID`    | Used as `project_id` on every event                          |
| `DISABLE_ANALYTICS` | Set to `true` to skip installing the analytics plugin in dev |

## Best Practices

### 1. Use Namespaced Event Names

```html
<!-- Good: feature.action naming -->
<button gxp-track="checkin.submit">Check In</button>
<button gxp-track="checkin.cancel">Cancel</button>

<!-- Avoid: generic names -->
<button gxp-track="click1">Check In</button>
```

### 2. Track Intent, Not Implementation

Name events after what the user did, not which element they hit — the event name survives redesigns:

```html
<!-- Good -->
<a gxp-track="schedule.session.opened">View Session</a>

<!-- Avoid -->
<a gxp-track="blue_link_row_3">View Session</a>
```

### 3. Put IDs in Props, Not Names

Keep event names low-cardinality so they aggregate cleanly:

```html
<!-- Good -->
<button
	gxp-track="session.join"
	:gxp-track-props="JSON.stringify({ session_id: session.id })"
>
	Join
</button>

<!-- Avoid -->
<button :gxp-track="`session.join.${session.id}`">Join</button>
```

### 4. Combine Freely with Other GxP Directives

`gxp-track` composes with `gxp-string` / `gxp-src` on the same element:

```html
<button gxp-track="cta.clicked" gxp-string="btn_cta">Get Started</button>
<img
	gxp-track="sponsor.logo.clicked"
	gxp-src="sponsor_logo"
	src="/dev-assets/images/logo.png"
/>
```

## Troubleshooting

### Events not appearing in console

1. Verify the plugin is installed — `DISABLE_ANALYTICS` must not be `true`
2. Check the element actually has a non-empty `gxp-track` value
3. Confirm `window.gxp.track` exists in the console

### Events double-firing

Don't add both the `v-gxp-track` directive and a raw `gxp-track` attribute pointing at different keys on the same element. (Identical usage is deduplicated automatically.)

### gxp-track-props ignored

The attribute must be valid JSON — single-quoted HTML attribute wrapping double-quoted JSON keys. Invalid JSON is silently dropped.
