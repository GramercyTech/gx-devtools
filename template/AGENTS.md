# GxP Plugin Development Guidelines

This is a GxP plugin project for the GxP kiosk platform. These rules always apply. For the step-by-step build workflow and detailed references, load the **`gxp-plugin` skill** (`.claude/skills/gxp-plugin/` for Claude Code, `.agents/skills/gxp-plugin/` for Codex and Antigravity) before doing any feature work.

## Platform vs. plugin — who owns what

**The GxP platform itself owns all admin configuration.** Plugins are consumers, not configurators:

- **Forms, quizzes, and surveys (including the quiz builder)** are built by admins in the platform UI. The plugin never defines fields, questions, scoring rules, leaderboards, or response schemas. At runtime it reads them through `store.callApi`. Discover the operations with `api_list_operation_ids` filtered by the `forms`/`quiz`/`survey` tags.
- **Project settings, assets, strings, dependencies, permissions, and the logged-in user** are injected into the GxP store at boot. Plugins read them; they don't create them.
- The plugin's own `app-manifest.json` + `configuration.json` describe **what the admin must configure for THIS plugin instance** (text, images, colors, which form/quiz to bind to). Everything else lives upstream.

When in doubt, search for the operation via `search_api_endpoints` / `api_list_tags` before inventing local state.

## Discover, never invent

Ground every endpoint, event, and store call in the `gxp-api` MCP server (defined in `.mcp.json`, served by the `mcp-serve` binary from `@gxp-dev/tools`). Verify it's live with `api_list_tags` before planning. If the `api_*` / `config_*` / `docs_*` tools aren't available, tell the user to run `claude mcp add gxp-api mcp-serve` (or `codex mcp add …` / add it to `~/.gemini/settings.json`) and restart the session. Do not proceed without the MCP.

The GxP store (`gxpPortalConfigStore`) is a **platform-provided runtime interface**. `src/stores/gxpPortalConfigStore.js` does NOT exist in the project, so never try to read that path. Call the MCP tool `describe_store_api` for the deployed contract.

```javascript
import { useGxpStore } from "@/stores/gxpPortalConfigStore"
const store = useGxpStore()
```

## File scope

Keep application components under `src/`. You may also edit plugin-owned `app-manifest.json`, `configuration.json`, assets, tests, test fixtures, and the operator-instructions source declared by the manifest when the task requires them. Do not edit the runtime container (layouts, routing, dev tools, or store initialization).

## Platform access and authorization

All platform data goes through the store: `store.callApi(operationId, identifier, data)`, where `identifier` is a permission identifier declared in `app-manifest.json` → `dependencies` + `permissions` (or the reserved `"project"`). Never use `axios` or `fetch` directly. The single exception is PUTting file bytes to a presigned storage URL the platform returned in `upload_urls` (the 20 MB+ `large_upload` flow); see the skill's `references/media-uploads.md`. Media players (e.g. Shaka) loading platform-returned media URLs are not raw API calls; see `references/video-playback.md`.

Generated platform calls must use declared `callApi` operation bindings. Do not replace a missing or denied binding with `apiGet`/`apiPost`/`apiPut`/`apiDelete`, and never use axios/fetch directly. Legacy helpers do not grant permissions or bypass server-side authorization. `apiPatch(endpoint, data)` is a supported legacy platform helper. Preserve existing authorized uses, but use declared `callApi` bindings for new generated platform calls.

The `"project"` identifier selects project context; it does not grant project-wide permission. Do not treat an authorization failure as permission to fall back to a raw endpoint.

## Keep API load small

`callApi` does not paginate. A list (index/search) call returns one page, by default up to 100 records, so every list call must be deliberate:

- Always pass `limit` sized to what the screen shows (e.g. 20), and `page`. Load more on demand using `meta.current_page` / `meta.last_page`. Never loop through every page by default.
- Filter, sort and search on the server (`sort`, the endpoint's filters, search operations), not by downloading everything and filtering in the browser.
- Request only the related data you render. Index `include` is a comma-separated string (an array makes the request fail); search bodies use `includes: [{ relation }]`.
- For a count, request `limit: 1` and read `meta.total`. Don't fetch rows to count them.
- Don't poll. Subscribe to the operation's socket event (`api_find_events_for_operation`), and re-fetch one page only when an event says data changed.
- `visibleFields` on a dependency trims response fields only where the platform implements it (attendees and social stream posts today). It is not a general way to shrink responses.

Details and examples: the skill's `references/api-calls.md`, "List endpoints".

Write only to `store.triggerState`. `pluginVars`, `stringsList`, and `assetList` are platform-managed. `store.auth?.user` is `null` when logged out, so always guard it. `store.user`, `store.getUser*()` and `store.isAuthenticated()` are dev-only; do not ship code that calls them.

## Real-time events

- Peer events on the plugin's own channel: `store.sockets.primary.listenForWhisper(eventName, cb)` and `store.sockets.primary.broadcast(eventName, data)`.
- Platform API events: declare the event under the correct bound dependency, then `store.sockets[identifier][eventKey].listen(cb)`. Missing bindings or listeners are unresolved configuration, not permission to use the primary/project channel instead.
- For an initialized named socket use `store.listen(socketName, eventName, callback)` and its returned unsubscribe closure. A dependency identifier is not an arbitrary socket name. The event-first overload taking a permission identifier is development-only; do not ship code that depends on it.
- Every listener returns an unsubscribe function. Call it when context changes or the component unmounts.
- After adding a `callApi`, run `api_find_events_for_operation` and subscribe instead of polling.

## Content must be admin-editable

- Every string a user sees uses `gxp-string`, every image uses `gxp-src`, and meaningful interactions use `gxp-track` (namespaced `feature.action`, IDs in `gxp-track-props`). The only exceptions are API-rendered text and internal/debug strings.
- Every manifest entry needs a matching `configuration.json` field. Configuration field bindings (manifest keys remain in their original buckets):

- `strings.default.<key>` → `language_overrides.<key>`
- `settings.<key>` → `custom_settings.<key>`
- `assets.<key>` → `asset_list.<key>`
- `dependencies[]` identifier → `dependency_list.<identifier>`

Set each field's `default` to the shipped manifest value when one exists. Never pass `force: true` to a refused `config_*` mutation; fix the input.

- Plugins that call the form/quiz/survey API need `"formTemplate": true` in `app-manifest.json`. A `configuration.json` `formTemplate` array (starter questions) is optional and separate. See the skill's `references/form-apps.md`.

## Done means linted

Run `gxdev lint --all` and fix every error before declaring any change complete. Use `@gxp-dev/app-ui` components (`gxdev storybook` to browse them).
