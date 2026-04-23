# GxP Plugin Development Context

This is a GxP plugin project for the GxP kiosk platform built with Vue 3.

## Development Workflow

Work through these steps in order. Do not skip.

### 1. Understand the feature

Before writing anything, clarify with the client:

- Who uses it and what's the user-facing outcome?
- Which real data is read/written? Which real-time events matter?
- What must an admin be able to customize after ship (text, images, colors, thresholds)?

### 2. Discover data sources via the `gxp-api` MCP server

Ground the implementation in real platform endpoints and events. Do not invent API paths or event names.

- Endpoints — `api_list_tags`, `api_list_operation_ids`, `search_api_endpoints`, `api_get_operation_parameters`, `get_endpoint_details`.
- Find by payload shape — `api_find_endpoints_by_schema`.
- WebSocket events — `api_find_events_for_operation` (maps operationId → events via `x-triggered-by`), `api_list_events`, `search_websocket_events`, `get_asyncapi_spec`. Run for every planned operationId so you subscribe instead of polling.
- Canonical dependency JSON — `api_generate_dependency`.
- Documentation — `docs_list_pages`, `docs_search`, `docs_get_page`.

### 3. Plan with the client

Confirm a plan before implementing. It must include:

- Screens/components and which layout (Public/Private/System).
- Which store getters, API calls, and socket events power each piece of data.
- The **admin configuration form** (`configuration.json`) — every admin-editable string, asset, color, and setting listed as cards/fields.
- The exact keys you'll add to `app-manifest.json`.

### 4. Implement

- All data goes through the GxP store — `store.callApi(operationId, identifier, data)` for platform APIs, plus sockets, strings, assets, settings, state. No direct `axios`/`fetch`.
- Every permission identifier used by `callApi` must be declared in `app-manifest.json` → `dependencies` + `permissions`. Use `"project"` for project-wide / top-level operations.
- Wire every user-facing text with `gxp-string` and every image with `gxp-src`.
- Only edit files under `src/`; the runtime container is off-limits.
- Add manifest entries for every string/asset/setting/dependency.
- Build `configuration.json` using the MCP `config_*` tools (they validate before writing).

### 5. Test broadcasts

- `gxdev socket list` — see available events.
- `gxdev socket send --event <EventName>` — fire a test broadcast.
- `test_api_route` MCP tool — hit endpoints against the local mock.
- `test_scaffold_component_test` MCP tool — generate Vitest files.

### 6. Lint

```bash
gxdev lint --all
```

Fix every error before declaring done.

## Architecture

The plugin runs inside a container provided by the `gxdev` server. Only edit files in `src/`:

- `src/Plugin.vue` - Main entry point
- `src/components/` - Reusable components
- `src/views/` - Page components
- `app-manifest.json` - Strings, assets, settings, dependencies (hot-reloaded)
- `configuration.json` - Admin-facing configuration form (cards + fields)

## Critical Rule: Use `store.callApi` for All Platform Calls

Every call to the GxP platform goes through `store.callApi(operationId, identifier, data)`. It handles auth, URL resolution, team/project scoping, and path-parameter substitution.

```javascript
import { useGxpStore } from "@gx-runtime/stores/gxpPortalConfigStore"
const store = useGxpStore()

await store.callApi(operationId, identifier, data)
```

- **`operationId`** — OpenAPI operationId. Look it up with `api_list_operation_ids` or `search_api_endpoints` (MCP). Do not invent one.
- **`identifier`** — a permission identifier declared in `app-manifest.json` → `dependencies` / `permissions`. It scopes the call to the resource the admin has bound to that identifier, and supplies the parent ID for path substitution.
- **`data`** — body fields, query params, or path params not supplied by the identifier. `"pluginVars.someKey"` pulls a value from settings at call time.

### Permission identifier pattern

Declare identifiers by the **role** a resource plays, not its name. Example — a plugin that reads posts from one social stream and creates posts on another:

```json
// app-manifest.json
{
	"dependencies": [
		{ "identifier": "social_stream_one", "model": "SocialStream" },
		{ "identifier": "social_stream_two", "model": "SocialStream" }
	],
	"permissions": [
		{ "identifier": "social_stream_one", "description": "Source — read posts" },
		{ "identifier": "social_stream_two", "description": "Destination — create posts" }
	]
}
```

```javascript
const posts = await store.callApi("posts.index", "social_stream_one")
await store.callApi("posts.store", "social_stream_two", {
	body: "Hello world",
})
```

### The `"project"` identifier

For project-wide operations (creating the parent resource itself, or any top-level call not scoped to a dependency) use the reserved identifier `"project"`. You must pass any required IDs in `data`:

```javascript
const stream = await store.callApi("social_streams.store", "project", {
	name: "New Stream",
})

await store.callApi("posts.store", "project", {
	socialStreamId: stream.id,
	body: "First post",
})
```

### Low-level methods

`store.apiGet` / `apiPost` / `apiPut` / `apiPatch` / `apiDelete` bypass the permission model. Avoid unless you have a specific reason. Never use axios or fetch directly.

## Store Data Access

```javascript
// Getters
store.getString("key", "default") // UI strings
store.getSetting("key", "default") // Settings
store.getAsset("key", "/fallback.jpg") // Asset URLs
store.getState("key", null) // Runtime state

// Setters
store.updateString("key", "value")
store.updateSetting("key", "value")
store.updateAsset("key", "url")
store.updateState("key", "value")
```

## Real-Time Events

Two streams, both through the store:

1. **`primary` channel** — peer pub/sub between users of this plugin.
2. **Platform API events** — AsyncAPI events from `${apiDocsBaseUrl}/api-specs/asyncapi.json` (`components.messages`). Each message may declare `x-triggered-by` pointing at an OpenAPI operationId.

### `primary` channel

```javascript
store.listen("primary", "custom_event", (data) => { /* ... */ })
store.broadcast("primary", "custom_event", { hello: "world" })
```

### Platform API events

```javascript
// Event name first, permission identifier second, callback third
store.listen("SocialStreamPostCreated", "social_stream_two", (post) => {
	// fires whenever the admin-bound social_stream_two receives a new post
})
```

The permission identifier is the same one you use in `callApi` — it scopes the subscription to the admin-bound resource. Use `"project"` for project-wide events.

### Replace polling with events

Whenever you add a `callApi` call, check whether its operationId triggers a socket event using MCP tools:

- `api_find_events_for_operation { operationId: "posts.store" }` — returns events whose `x-triggered-by` matches.
- `api_list_events` — list all events; optional `triggeredBy` filter.
- `search_websocket_events` — keyword search.

If a match exists, subscribe instead of polling.

### Testing broadcasts

```bash
gxdev socket list
gxdev socket send --event EventName
```

## Vue Directives

Every admin-editable piece of content goes through a directive — that's the bridge between the component and the admin form.

```html
<!-- Dynamic text from strings -->
<h1 gxp-string="welcome_title">Default</h1>

<!-- Dynamic images from assets -->
<img gxp-src="hero_image" src="/placeholder.jpg" />
```

## Admin Configuration Form

`configuration.json` defines the form admins use to customize the plugin. Use the MCP `config_*` tools to build it — `config_list_card_types`, `config_list_field_types`, `config_get_field_schema`, `config_add_card`, `config_add_field`, `config_validate`, `config_extract_strings`. Mutations are linter-guarded.

## Component Kit

Use `@gramercytech/gx-componentkit` for UI:
GxButton, GxCard, GxInput, GxModal, GxSpinner, GxAlert, GxBadge, GxProgress, GxTabs

## API Specs

Prefer the MCP tools over direct fetches:

- OpenAPI: https://api.zenith-develop.env.eventfinity.app/api-specs/openapi.json
- AsyncAPI: https://api.zenith-develop.env.eventfinity.app/api-specs/asyncapi.json
