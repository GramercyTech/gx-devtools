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
- WebSocket events — `search_websocket_events`, `get_asyncapi_spec`.
- Canonical dependency JSON — `api_generate_dependency`.
- Documentation — `docs_list_pages`, `docs_search`, `docs_get_page`.

### 3. Plan with the client

Confirm a plan before implementing. It must include:

- Screens/components and which layout (Public/Private/System).
- Which store getters, API calls, and socket events power each piece of data.
- The **admin configuration form** (`configuration.json`) — every admin-editable string, asset, color, and setting listed as cards/fields.
- The exact keys you'll add to `app-manifest.json`.

### 4. Implement

- All data goes through the GxP store — API, sockets, strings, assets, settings, state. No direct `axios`/`fetch`.
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

## Critical Rule: Use GxP Store for All Data

NEVER use axios or fetch directly. Always use the store for API, sockets, and data access:

```javascript
import { useGxpStore } from "@gx-runtime/stores/gxpPortalConfigStore"
const store = useGxpStore()

// API methods (handles auth, CORS, base URL automatically)
await store.apiGet("/api/v1/endpoint", { params })
await store.apiPost("/api/v1/endpoint", data)
await store.apiPut("/api/v1/endpoint/id", data)
await store.apiPatch("/api/v1/endpoint/id", data)
await store.apiDelete("/api/v1/endpoint/id")
```

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

## WebSocket Events

```javascript
// Listen for events
store.listenSocket("primary", "EventName", (data) => {
	console.log("Event received:", data)
})

// Emit events
store.emitSocket("primary", "event-name", data)
```

Test a broadcast without waiting for the platform:

```bash
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
