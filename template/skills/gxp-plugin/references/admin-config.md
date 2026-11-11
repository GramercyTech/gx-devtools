# Manifest sync and admin configuration form

Load this after adding any `callApi`, `listen`, `gxp-string`, `gxp-src` or `gxp-track`, or when editing `configuration.json`.

## Sync the manifest

Run the MCP tool `config_extract_strings` with `writeTo: "app-manifest.json"`. It scans `src/` for every `gxp-string`, `gxp-src`, `gxp-track`, `store.getString/getSetting/getAsset/getState`, `gxp.track`/`gxpTrack`, and `store.callApi` identifier and merges the new keys into the manifest (linter-guarded; falls back to `gxdev extract-config` on the CLI if you need it). Do this every time you touch the plugin's public surface so the manifest never drifts from the code.

Analytics events land under `track-events`, with every `gxp-track-props` key seeded as `"string"`. After extraction, refine the prop types by hand where you know more: an array of allowed values when the prop is an enum (`"variant": ["primary", "secondary"]`), or a relationship object when it carries a platform record reference (`"attendee_id": { "type": "attendee", "value": "id" }`). Re-extraction never overwrites these refinements.

**Extraction limit:** `config_extract_strings` only detects `gxp-track` attributes and `gxp.track("literal")` / `gxpTrack("literal")` calls. Events sent through a wrapper (`emit(name)`, `send(name, props)`, a player tracker) are not extracted. Declare those in `track-events` by hand. See `video-playback.md`.

## Build `configuration.json`

`configuration.json` defines the form admins use to customize the plugin after it ships. Every string, asset, dependency, color, and setting your plugin exposes must have a matching field here.

The full workflow — run it whenever you've added/changed a `callApi`, `listen`, `gxp-string`, or `gxp-src`:

1. **Extract the configurable surface into `app-manifest.json`** — `config_extract_strings` with `writeTo: "app-manifest.json"` (same logic as `gxdev extract-config` on the CLI). It scans `src/` for directives and store usage and merges the new keys into the manifest, linter-guarded.
2. **Add a form field in `configuration.json` for every manifest entry**, using the mapping below.
3. **Validate** — `config_validate` on demand, or `gxdev lint --all` at the end.

## Default field mapping

| Manifest source                                  | `configuration.json` field                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `strings.default.<key>`                          | `text` (short) or `textarea` (long)                                                         |
| `assets.<key>` (driven by `gxp-src`)             | `selectAsset`                                                                               |
| `dependencies[]` — each declared identifier      | `asyncSelect` bound to the matching resource list endpoint so the admin picks a real record |
| `settings.<key>` representing a color            | `colorPicker`                                                                               |
| `settings.<key>` representing a threshold/number | `number`                                                                                    |
| `settings.<key>` representing a feature toggle   | `boolean`                                                                                   |
| Any other setting discussed with the client      | Pick via `config_list_field_types` / `config_get_field_schema`                              |

Group related fields into `fields_list` cards (`config_add_card` then `config_add_field`). Use the bucket-prefixed field names below, not bare manifest keys.

Configuration field bindings (manifest keys remain in their original buckets):

- `strings.default.<key>` → `language_overrides.<key>`
- `settings.<key>` → `custom_settings.<key>`
- `assets.<key>` → `asset_list.<key>`
- `dependencies[]` identifier → `dependency_list.<identifier>`

Set each field's `default` to the shipped manifest value when one exists.

## Relevant tools

- `config_list_card_types`, `config_list_field_types` — enumerate what's available.
- `config_get_field_schema` — get the shape (required props, conditional rules) of a specific field type.
- `config_add_card`, `config_add_field`, `config_move_field`, `config_remove_field`, `config_move_card`, `config_remove_card` — mutate the form. Linter-guarded; invalid writes are refused.
- `config_extract_strings` — the manifest-sync entry point described above.
- `config_validate` — validate a file on demand.

If a mutation is refused, read the validation error and fix the input — do not reach for `force: true`.
