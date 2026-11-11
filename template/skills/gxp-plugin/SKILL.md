---
name: gxp-plugin
description: Build or change a GxP platform plugin (Vue 3 + GxP store). Use for any feature work in a GxP plugin project — new screens or components, platform API calls (store.callApi), real-time socket events, gxp-string/gxp-src/gxp-track directives, app-manifest.json, configuration.json admin forms, form/quiz/survey apps (formTemplate), and recording or uploading video, audio or large files. Explains the 7-step workflow and where to find the authoritative API, store, and docs information.
---

# Building a GxP plugin

`AGENTS.md` holds the always-on rules (platform vs. plugin ownership, file scope, authorization). This skill is the workflow plus pointers to the details. Read only the reference files the current task needs.

## Where the truth lives — look it up, don't guess

| You need                                | Ask                                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Which operationId to call               | `gxp-api` MCP: `api_list_tags`, `api_list_operation_ids`, `search_api_endpoints`                      |
| An endpoint's params / payload          | `api_get_operation_parameters`, `get_endpoint_details`, `api_find_endpoints_by_schema`                |
| Events an operation fires               | `api_find_events_for_operation`, `api_list_events`, `search_websocket_events`                         |
| The dependency JSON for the manifest    | `api_generate_dependency` (or `gxdev add-dependency`)                                                 |
| The exact store API (deployed contract) | `describe_store_api` — never read `src/stores/gxpPortalConfigStore.js`, it does not exist in projects |
| Data model shapes                       | `describe_data_models`                                                                                |
| Admin form field / card types           | `config_list_field_types`, `config_list_card_types`, `config_get_field_schema`                        |
| Platform docs and guides                | `docs_search`, `docs_get_page`, `docs_list_pages` (docs.gxp.dev)                                      |
| UI components (`@gxp-dev/app-ui`)       | `gxdev storybook` → `gxp-app-ui-storybook` MCP at `http://localhost:6006/mcp`                         |

First call `api_list_tags` to confirm the MCP is live. If the `api_*` / `config_*` / `docs_*` tools are missing, stop and tell the user to register it (`claude mcp add gxp-api mcp-serve`, `codex mcp add gxp-api -- mcp-serve`, or the `.gemini/settings.json` entry), then restart the session.

## Workflow — follow in order

1. **Understand.** Who uses it (attendee, staff, admin)? What data does it read and write, what does it react to in real time, and what must an admin be able to configure? Ask instead of guessing.
2. **Discover.** Use the MCP to list the operationIds, events and dependencies you'll use. Run `api_find_events_for_operation` for every operationId, so you subscribe instead of polling. Output: a short list of each.
3. **Plan, and confirm with the user.** Cover screens/components and layout (Public/Private/System), data flow, the admin configuration form (every string, asset, color, threshold and toggle), and the exact manifest keys. Don't implement until it's reviewed.
4. **Implement.** All data goes through the store. Every visible string gets `gxp-string`, every image gets `gxp-src`, and meaningful interactions get `gxp-track`. Use `@gxp-dev/app-ui` components.
5. **Sync manifest + admin form.** Run `config_extract_strings` with `writeTo: "app-manifest.json"`, then add a `configuration.json` field for every manifest entry with the `config_*` tools. Then run `gxdev lint --all`.
6. **Test.** Use `gxdev socket send --event <Name>`, `test_api_route` against the mock API, and `test_scaffold_component_test` for non-trivial components.
7. **Final lint.** Run `gxdev lint --all` again and fix every error. Never mark work done with failing lint.

## Reference files — load on demand

- `references/api-calls.md`: `store.callApi(operationId, identifier, data)`, permission identifiers, the `"project"` identifier, legacy helpers. **Read this before writing any API call.**
- `references/realtime-events.md`: the `primary` channel, platform API events via bound dependencies, unsubscribing, replacing polling, local broadcast testing.
- `references/ui-strings-and-tracking.md`: `gxp-string`, `gxp-src`, `gxp-track` / `gxp.track()`, the component kit.
- `references/admin-config.md`: manifest extraction, `configuration.json` field mapping and bindings, `config_*` tools.
- `references/form-apps.md`: form/quiz/survey apps — manifest `formTemplate: true` vs. configuration `formTemplate: [...]`.
- `references/media-uploads.md`: uploading recorded video/audio and any file that can reach 20 MB. Keep the full codec MIME type and set a plain extension via the data key (`attachment.webm`). Files of 20 MB or more use the two-step `large_upload` + presigned-PUT flow. **Read this before any file upload.**
- `references/store-reference.md`: getters, `triggerState`, logged-in user, dev-only helpers.
- `references/testing-and-environments.md`: socket/mock-API testing, lint commands, `VITE_API_ENV`, spec URLs.
