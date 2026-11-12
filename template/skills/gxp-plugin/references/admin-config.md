# Manifest sync and admin configuration form

Load this after adding any `callApi`, `listen`, `gxp-string`, `gxp-src` or `gxp-track`, or when editing `configuration.json`.

## Sync the manifest

Run the MCP tool `config_extract_strings` with `writeTo: "app-manifest.json"`. It scans `src/` for every `gxp-string`, `gxp-src`, `gxp-track`, `store.getString/getSetting/getAsset/getState`, `gxp.track`/`gxpTrack`, and `store.callApi` identifier and merges the new keys into the manifest (linter-guarded; falls back to `gxdev extract-config` on the CLI if you need it). Do this every time you touch the plugin's public surface so the manifest never drifts from the code.

Analytics events land under `track-events`, with every `gxp-track-props` key seeded as `"string"`. After extraction, refine the prop types by hand where you know more: an array of allowed values when the prop is an enum (`"variant": ["primary", "secondary"]`), or a relationship object when it carries a platform record reference (`"attendee_id": { "type": "attendee", "value": "id" }`). Re-extraction never overwrites these refinements.

**Extraction limit:** `config_extract_strings` only detects `gxp-track` attributes and `gxp.track("literal")` / `gxpTrack("literal")` calls. Events sent through a wrapper (`emit(name)`, `send(name, props)`, a player tracker) are not extracted. Declare those in `track-events` by hand. See `video-playback.md`.

## Build `configuration.json`

`configuration.json` defines the form admins use to customize the plugin after it ships. Every string, asset, dependency, color, and setting your plugin exposes must have a matching field here.

**Shape: `additionalTabs` is an array of TABS, not cards.** The platform treats every item as a tab and only reads its `cards` (or `fieldsList`). Each item must be one of:

- a `card_list` with `cards: [...]` (the cards become the tab body),
- a `fields_list` with `fieldsList: [...]`, or
- a tab object `{ "title": "...", "cards": [...] }`.

Never use builder field types (`form-builder`, `quiz_builder`, `reactive-canvas-builder`, `dependency-list-builder`). They are platform-admin editors, and the linter rejects them. Every other type from `config_list_field_types` is fine.

Never put a `tabs_list` (or any other card type) directly in `additionalTabs`. Its contents are silently dropped. For sub-tabs, nest the `tabs_list` inside a tab's `cards`:

```json
{
	"additionalTabs": [
		{
			"type": "card_list",
			"cards": [{ "type": "fields_list", "title": "General", "fieldsList": [] }]
		}
	]
}
```

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

## Field value shapes the plugin reads at runtime

Most fields store a plain value at their `name` path (for example `custom_settings.headline` → `store.getSetting("headline")`). Two field types are different:

### `dynamic_options` (admin-editable repeating list, e.g. a button list)

```json
{
	"type": "dynamic_options",
	"name": "buttons",
	"column": "custom_settings",
	"options": {
		"orderable": true,
		"max": 6,
		"addOptionButtonLabel": "Add button",
		"optionConfig": [
			{ "type": "text", "name": "label", "label": "Label" },
			{ "type": "text", "name": "url", "label": "Link" }
		]
	}
}
```

The value is **not** stored as an array. The platform writes two things:

- `custom_settings.buttons_order`: `{ "<uuid>": <order>, … }`. A removed option keeps its uuid with `order: null`.
- `custom_settings.buttons.<uuid>.<optionField>`, one entry per option field (an option with its own `column` is stored under `<option.column>.buttons.<uuid>.<field>` instead).

Rebuild the list in the plugin:

```javascript
const order = store.getSetting("buttons_order", {}) || {}
const items = store.getSetting("buttons", {}) || {}
const buttons = Object.entries(order)
	.filter(([, position]) => position !== null)
	.sort(([, a], [, b]) => a - b)
	.map(([uuid]) => ({ id: uuid, ...items[uuid] }))
```

Mirror this shape in `app-manifest.json` `settings` so the dev server has sample data.

### `icon-selector`

Stores a Font Awesome string `"<style>.<name>"`, for example `"far.chevron-up"`. Styles are `fas`, `far`, `fal`, `fat`. `@gxp-dev/app-ui` renders icons with Lucide, not Font Awesome, so a plugin can't display this value with app-ui alone. Unless the plugin ships its own Font Awesome renderer, use a `select` of Lucide icon names (or a `text` field holding a Lucide name) instead of `icon-selector`.

## When docs lookup fails

If `docs_search` / `docs_get_page` errors or returns nothing, don't guess a field's stored shape. Check `config_get_field_schema` for the type and this reference first. If it's still unconfirmed, list it as an open question in the plan instead of building on an assumption.

## Relevant tools

- `config_list_card_types`, `config_list_field_types` — enumerate what's available.
- `config_get_field_schema` — get the shape (required props, conditional rules) of a specific field type.
- `config_add_card`, `config_add_field`, `config_move_field`, `config_remove_field`, `config_move_card`, `config_remove_card` — mutate the form. Linter-guarded; invalid writes are refused.
- `config_extract_strings` — the manifest-sync entry point described above.
- `config_validate` — validate a file on demand.

If a mutation is refused, read the validation error and fix the input — do not reach for `force: true`.
