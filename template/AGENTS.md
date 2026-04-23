# GxP Plugin Development Guidelines

This is a GxP plugin project for the GxP kiosk platform. Follow these guidelines when working with this codebase.

## Development Workflow

Every task starts with understanding and ends with a validated, linted build. Do not skip steps.

### 1. Understand what the client is building

Before touching code, get specific about the feature:

- What is the user-facing outcome? Who uses it (attendee, staff, admin)?
- Which real-world data does it read or write?
- What events does it react to in real time?
- What needs to be configurable by an admin (text, assets, colors, thresholds, feature flags)?

Ask clarifying questions instead of guessing. A 30-second question beats a 30-minute rewrite.

### 2. Discover the right data sources via MCP

Use the `gxp-api` MCP server to ground the implementation in the real platform — never invent endpoints or event names.

- **Find endpoints** — `api_list_tags`, `api_list_operation_ids` (optionally scoped by tag), `search_api_endpoints` (keyword).
- **Inspect a specific endpoint** — `api_get_operation_parameters`, `get_endpoint_details`.
- **Find endpoints by payload shape** — `api_find_endpoints_by_schema` (search by request/response field names).
- **Find WebSocket events** — `search_websocket_events`, `get_asyncapi_spec`.
- **Generate dependency JSON** — `api_generate_dependency` produces the canonical entry for `app-manifest.json` → `dependencies`.
- **Read the docs** — `docs_list_pages`, `docs_search`, `docs_get_page` (full-text search across docs.gxp.dev).

Output of this step: a short list of the operationIds, WebSocket events, and dependencies the plugin will use.

### 3. Plan with the client, including the admin config form

Before writing code, produce a plan and confirm it with the client. The plan must include:

- **Screens/components** — what's rendered and in which layout (Public/Private/System).
- **Data flow** — which store getters read which sections, which API calls populate them, which socket events mutate state.
- **Admin configuration form** — every piece of customizable content belongs in `configuration.json` as a card/field so admins can edit it without a code change. Cover text (strings), images (assets), colors/thresholds (settings), and feature toggles.
- **Strings and assets inventory** — the exact keys that will appear in `app-manifest.json`.

Do not proceed to implementation until the client has reviewed the plan.

### 4. Implement

Build against the plan:

- Use the GxP store for **all** data access — API calls, sockets, strings, assets, settings, state. Never use `axios` or `fetch` directly.
- Wire every piece of user-facing text with `gxp-string` and every image with `gxp-src` so the admin form controls them.
- Keep components under `src/`. The runtime container (layouts, routing, dev tools) is not yours to edit.
- Add entries to `app-manifest.json` for every string/asset/setting/dependency the plan calls for.
- Build the admin form in `configuration.json` using the MCP config tools (`config_add_card`, `config_add_field`, `config_get_field_schema`, `config_list_field_types`, `config_list_card_types`). Every mutation is linter-guarded — invalid writes are refused.

### 5. Test with real broadcasts

Before declaring done, exercise the plugin against real event shapes:

- List available events — `gxdev socket list`.
- Send one — `gxdev socket send --event <EventName>` (edit or add payloads under `socket-events/`).
- Hit endpoints against the local mock API via the `test_api_route` MCP tool.
- Scaffold unit tests with `test_scaffold_component_test` for any non-trivial component.

### 6. Lint

Always finish by running the linter. `configuration.json` and `app-manifest.json` are validated against schemas in `bin/lib/lint/schemas/`.

```bash
gxdev lint           # validate default targets
gxdev lint --all     # validate everything
```

Fix every error. Do not mark work complete with a failing lint.

## Project Architecture

This plugin runs inside a container environment provided by the `gxdev` development server. You should ONLY modify files in the `src/` directory. The runtime container (PortalContainer.vue) handles layouts, dev tools, routing, and store initialization.

```
src/
├── Plugin.vue          # MAIN ENTRY POINT - Your app starts here
├── components/         # Reusable Vue components
├── views/              # Page-level components
├── stores/index.js     # Re-exports useGxpStore
└── assets/             # Static assets
```

## Core Principle: Use the GxP Store for Everything

The `gxpPortalConfigStore` is the central hub for every piece of data — API, sockets, strings, assets, settings, state. Import it in any component:

```javascript
import { useGxpStore } from "@gx-runtime/stores/gxpPortalConfigStore"
const store = useGxpStore()
```

## API Calls - ALWAYS Use Store Methods

NEVER use axios or fetch directly. The store handles authentication, base URLs, and CORS:

```javascript
// Correct - use store methods
const data = await store.apiGet("/api/v1/endpoint", { param: "value" })
await store.apiPost("/api/v1/endpoint", { data: "value" })
await store.apiPut("/api/v1/endpoint/123", { data: "value" })
await store.apiPatch("/api/v1/endpoint/123", { data: "value" })
await store.apiDelete("/api/v1/endpoint/123")

// WRONG - never do this
// const response = await axios.get(...);  // NO!
// const response = await fetch(...);      // NO!
```

## Store Data Access

```javascript
// Get values with fallbacks
store.getString("key", "default") // From stringsList
store.getSetting("key", "default") // From pluginVars
store.getAsset("key", "/fallback.jpg") // From assetList
store.getState("key", null) // From triggerState
store.hasPermission("admin") // Check permissions

// Update values
store.updateString("key", "value")
store.updateSetting("key", "value")
store.updateAsset("key", "url")
store.updateState("key", "value")
```

## WebSocket Events

Listen for real-time events through the store:

```javascript
// Listen on primary socket
store.listenSocket("primary", "EventName", (data) => {
	console.log("Received:", data)
})

// Emit events
store.emitSocket("primary", "client-event", { data: "value" })

// For dependency-based sockets
store.useSocketListener("dependency_id", "updated", callback)
```

Test a broadcast without waiting for the real platform:

```bash
gxdev socket list                      # list available events
gxdev socket send --event EventName    # send a test event
```

Use `search_websocket_events` (MCP) to discover which events are real before you listen.

## Vue Directives for Dynamic Content

Every piece of admin-editable content goes through a directive — that's what makes the configuration form meaningful.

```html
<!-- Text from strings -->
<h1 gxp-string="welcome_title">Fallback Title</h1>

<!-- Text from settings -->
<span gxp-string="company_name" gxp-settings>Company</span>

<!-- Images from assets -->
<img gxp-src="hero_image" src="/placeholder.jpg" alt="Hero" />
```

## Admin Configuration Form (`configuration.json`)

`configuration.json` defines the form admins use to customize the plugin after it ships. Every string, asset, color, and setting your plugin exposes must have a matching field here.

Build it with the MCP `config_*` tools — they validate against the schema before writing:

- `config_list_card_types`, `config_list_field_types` — see what's available.
- `config_get_field_schema` — get the shape of a specific field type.
- `config_add_card`, `config_add_field`, `config_move_field`, `config_remove_field`.
- `config_extract_strings` — pull hardcoded strings from components into the manifest.
- `config_validate` — validate a file on demand.

## Component Kit

Import UI components from `@gramercytech/gx-componentkit`:

```javascript
import {
	GxButton,
	GxCard,
	GxInput,
	GxModal,
	GxSpinner,
} from "@gramercytech/gx-componentkit"
```

Available: GxButton, GxCard, GxInput, GxModal, GxSpinner, GxAlert, GxBadge, GxAvatar, GxProgress, GxTabs, GxAccordion

## Configuration Files

- `app-manifest.json` — strings, assets, settings, dependencies, permissions. Hot-reloaded in dev.
- `configuration.json` — admin-facing form definition (cards + fields).

## Linting

Run before declaring any change complete:

```bash
gxdev lint           # default targets
gxdev lint --all     # everything
gxdev lint --json    # machine-readable output
```

## Testing

- Socket events: `gxdev socket send --event EventName`
- API calls against local mock: `test_api_route` MCP tool
- Component tests: `test_scaffold_component_test` MCP tool
- Dev Tools: Press Ctrl+Shift+D
- Console: `window.gxDevTools.store()` to inspect store

## API Environments

Set `VITE_API_ENV` in `.env`:

- `mock` - Local mock server (default)
- `develop` - https://api.zenith-develop.env.eventfinity.app
- `staging` - https://api.efz-staging.env.eventfinity.app
- `production` - https://api.gramercy.cloud

## API Documentation

Prefer the MCP tools (`get_openapi_spec`, `search_api_endpoints`, `docs_search`, etc.) over fetching these URLs directly:

- OpenAPI Spec: https://api.zenith-develop.env.eventfinity.app/api-specs/openapi.json
- AsyncAPI Spec: https://api.zenith-develop.env.eventfinity.app/api-specs/asyncapi.json
- Webhooks: https://api.zenith-develop.env.eventfinity.app/api-specs/webhooks.json
