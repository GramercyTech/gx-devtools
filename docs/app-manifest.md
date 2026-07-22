---
sidebar_position: 3
title: App Manifest
description: Configure your plugin with settings, strings, assets, and more
---

# App Manifest

The `app-manifest.json` file is the central configuration for your GxP plugin. It defines settings, translatable strings, assets, and runtime state that the platform injects into your plugin.

## File Location

The manifest file should be in your project root:

```
my-plugin/
├── app-manifest.json    # <-- Here
├── src/
└── ...
```

## Basic Structure

```json
{
	"settings": {},
	"strings": {},
	"assets": {},
	"triggerState": {},
	"dependencies": [],
	"permissions": []
}
```

## Configuration Sections

### Settings (`pluginVars`)

Define configurable settings that administrators can customize per deployment:

```json
{
	"settings": {
		"primary_color": "#FFD600",
		"background_color": "#ffffff",
		"company_name": "Acme Corp",
		"max_items": 10,
		"enable_animations": true
	}
}
```

Access in your component:

```javascript
const store = useGxpStore()

// Get a setting with fallback
const color = store.getSetting("primary_color", "#000000")

// Check if setting exists
if (store.pluginVars.enable_animations) {
	// ...
}
```

Use in templates with the `gxp-settings` modifier:

```html
<span gxp-string="company_name" gxp-settings>Default Company</span>
```

### Strings (`stringsList`)

Define translatable text content:

```json
{
	"strings": {
		"default": {
			"welcome_title": "Welcome to the Event",
			"welcome_subtitle": "Please check in below",
			"button_checkin": "Check In",
			"button_cancel": "Cancel",
			"error_not_found": "Registration not found"
		}
	}
}
```

Use in templates with the `gxp-string` directive:

```html
<h1 gxp-string="welcome_title">Default Welcome</h1>
<button gxp-string="button_checkin">Check In</button>
```

Access programmatically:

```javascript
const store = useGxpStore()
const title = store.getString("welcome_title", "Default Title")
```

:::tip Hot Reload
Changes to strings in `app-manifest.json` are hot-reloaded during development. No page refresh needed!
:::

### Assets (`assetList`)

Define asset URLs (images, documents, etc.):

```json
{
	"assets": {
		"hero_image": "/dev-assets/images/hero.jpg",
		"logo": "/dev-assets/images/logo.png",
		"background": "/dev-assets/images/bg-pattern.svg",
		"welcome_video": "/dev-assets/videos/intro.mp4"
	}
}
```

Use in templates with the `gxp-src` directive:

```html
<img gxp-src="hero_image" src="/dev-assets/placeholder.jpg" alt="Hero" />
<img gxp-src="logo" src="/dev-assets/placeholder.jpg" alt="Logo" />
```

Access programmatically:

```javascript
const store = useGxpStore()
const heroUrl = store.getAsset("hero_image", "/fallback.jpg")
```

### Trigger State (`triggerState`)

Define dynamic runtime state that can change during plugin execution:

```json
{
	"triggerState": {
		"is_active": true,
		"current_step": 1,
		"checked_in_count": 0,
		"last_scan_result": null
	}
}
```

Use in templates with the `gxp-state` modifier:

```html
<span gxp-string="current_step" gxp-state>1</span>
<img gxp-src="dynamic_badge" gxp-state src="/placeholder.jpg" />
```

Update programmatically:

```javascript
const store = useGxpStore()

// Update state
store.updateState("current_step", 2)
store.updateState("checked_in_count", store.triggerState.checked_in_count + 1)

// Read state
const step = store.getState("current_step", 1)
```

### Form (`form`)

For form-backed apps (registration forms, quizzes, surveys), declare a mock form so the dev store attaches a form store as `store.form` — the same interface plugins get on-platform when a page is backed by a ProjectForm:

```json
{
	"form": {
		"formId": "my-registration-form",
		"schema": {
			"root": { "cardList": ["card-1"] },
			"cards": {
				"card-1": {
					"id": "card-1",
					"title": "General",
					"elementList": ["el-1", "el-2"]
				}
			},
			"elements": {
				"el-1": {
					"id": "el-1",
					"name": "first_name",
					"type": "input",
					"label": "First Name",
					"required": true
				},
				"el-2": {
					"id": "el-2",
					"name": "contact_email",
					"type": "email",
					"label": "Email",
					"required": true
				}
			}
		},
		"prefillData": { "first_name": "Jane" },
		"registrationMode": "both",
		"conditions": true,
		"mockResponses": { "submit": { "success": true, "status": "created" } }
	}
}
```

| Key                | Description                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `formId`           | Form slug/id (falls back to `settings.formId`, then `dev-form`). Also stamped onto `pluginVars.formId` for `callApi` path injection. |
| `schema`           | Form schema — v2 shape (`{ root, cards, elements }`) or `{ sections: [...] }`. A top-level `sections` array also works.              |
| `prefillData`      | Slug → value map seeded into `formData` (simulates attendee prefill on update-capable forms).                                        |
| `settings`         | Form settings object (`registration_mode` etc.) as the platform returns it.                                                          |
| `strings`          | Locale-keyed form strings (`{ "default": { "registration": { ... } } }`).                                                            |
| `registrationMode` | `new_only` \| `update_only` \| `both`.                                                                                               |
| `conditions`       | Enable conditional-visibility processing of `condition_params` against `formData`.                                                   |
| `mockResponses`    | Canned results for `submit` / `saveProgress` instead of hitting an API.                                                              |

See the [GxP Store docs](./gxp-store.md#form-store-storeform) for the full `store.form` API. The section is hot-reloaded like the rest of the manifest.

### Dependencies

Dependencies define external API services your plugin can interact with. Each dependency maps API operations to endpoints that can be called via `gxpStore.callApi()`.

#### Dependency Structure

```json
{
	"dependencies": [
		{
			"identifier": "access_points",
			"model": "AccessPoint",
			"permissionKey": "access_point",
			"permissions": ["view_access_points", "manage_access_points"],
			"operations": {
				"access-points.index": "get:/v1/projects/{teamSlug}/{projectSlug}/access-points",
				"access-points.show": "get:/v1/projects/{teamSlug}/{projectSlug}/access-points/{access_point}",
				"access-points.store": "post:/v1/projects/{teamSlug}/{projectSlug}/access-points",
				"access-points.update": "put:/v1/projects/{teamSlug}/{projectSlug}/access-points/{access_point}",
				"access-points.destroy": "delete:/v1/projects/{teamSlug}/{projectSlug}/access-points/{access_point}"
			},
			"events": {
				"AccessPointUpdated": "AccessPointUpdated",
				"AccessPointDeleted": "AccessPointDeleted"
			}
		}
	]
}
```

#### Dependency Fields

| Field            | Type   | Description                                                                                                                          |
| ---------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `identifier`     | string | Object-scope token for this dependency (used in `callApi`). See scope tokens below.                                                  |
| `identifiers`    | array  | Multiple scope tokens, matched any-of. Use instead of `identifier`.                                                                  |
| `model`          | string | The model/resource name from the API                                                                                                 |
| `key`            | string | Model column the page's `dependency_list` binding values match (route key, default `id`)                                             |
| `permissionKey`  | string | Stable address of this dependency — used by rule scopes and `@<permissionKey>` references. Defaults to the identifier.               |
| `parentRelation` | string | Relation on this model pointing at a parent dependency's model, for `@<permissionKey>` scopes. Reflected by convention when omitted. |
| `permissions`    | array  | List of permissions granted through this dependency                                                                                  |
| `visibleFields`  | array  | Field ceiling for API responses of this model. Omitted = all fields.                                                                 |
| `operations`     | object | Map of operationId to `method:path` (e.g., `"get:/v1/..."`)                                                                          |
| `events`         | object | Map of socket event names this dependency can emit/receive                                                                           |

#### Scope Tokens

An `identifier` (or each entry of `identifiers`) is one of:

| Token               | Meaning                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------- |
| `some_name`         | A `dependency_list` binding key — the page configuration binds it to concrete object(s) |
| `*`                 | Every object of the model in the project (project-wide)                                 |
| `#<tag-id-or-slug>` | Objects carrying the given project tag                                                  |
| `@untagged`         | Objects with no project tags                                                            |
| `@<permissionKey>`  | **Parent scope** — objects related to the dependency addressed by that permission key   |

#### Parent-Scoped Dependencies (`@<permissionKey>`)

Prefer a parent scope over the legacy `:viewAny` permission suffix when a model
is only ever accessed through a parent object. The grants then apply to the
parent's related objects only — never project-wide:

```json
{
	"dependencies": [
		{
			"identifiers": ["group"],
			"model": "Group",
			"key": "slug",
			"permissions": ["view_groups", "view_attendees"],
			"permissionKey": "group"
		},
		{
			"identifier": "@group",
			"model": "Attendee",
			"permissions": ["view_attendees"],
			"permissionKey": "group-attendees"
		}
	]
}
```

With `dependency_list.group` bound to a group, the relation route
(`/groups/{group}/attendees/...`) works for that group only, and the direct
attendee endpoints (`/attendees/search`, `/attendees/{id}`) are limited to that
group's members. The platform resolves the child → parent relation
automatically (`Attendee::groups()`); declare `parentRelation` when the
relation name isn't conventional.

The linter validates parent references: `@<permissionKey>` must resolve to
another dependency in the same manifest, and must not self-reference or form a
cycle. Explicit `permissionKey` values must be unique.

#### Using the Add Dependency Wizard

The easiest way to add dependencies is using the CLI wizard:

```bash
gxdev add-dependency
```

This interactive wizard will:

1. Load the OpenAPI specification from the API
2. Display available API tags/models
3. Let you select which endpoints to include
4. Let you select which socket events to include
5. Generate the complete dependency configuration
6. Add it to your `app-manifest.json`

#### Calling Dependency APIs

Once defined, call any operation using `gxpStore.callApi()`:

```javascript
import { useGxpStore } from "@gx-runtime/stores/gxpPortalConfigStore"

const store = useGxpStore()

// List all access points
const accessPoints = await store.callApi("access-points.index", "access_points")

// Get a specific access point
const accessPoint = await store.callApi("access-points.show", "access_points", {
	access_point: 123,
})

// Create a new access point
const newAccessPoint = await store.callApi(
	"access-points.store",
	"access_points",
	{
		name: "Main Entrance",
		location: "Building A",
	},
)

// Update an access point
await store.callApi("access-points.update", "access_points", {
	access_point: 123,
	name: "Updated Name",
})

// Delete an access point
await store.callApi("access-points.destroy", "access_points", {
	access_point: 123,
})
```

The `callApi` method signature:

```javascript
store.callApi(operationId, identifier, (additionalData = {}))
```

- **operationId**: The operation key from `operations` (e.g., `'access-points.index'`)
- **identifier**: The dependency identifier (e.g., `'access_points'`)
- **additionalData**: Object containing path parameters and/or request body data

Returns `response.data` from the API response.

### Permissions

Define permissions required by the plugin:

```json
{
	"permissions": ["camera", "bluetooth", "notifications"]
}
```

Check permissions in code:

```javascript
const store = useGxpStore()

if (store.hasPermission("camera")) {
	// Enable camera features
}
```

### Track Events (`track-events`)

Declares the analytics events the plugin reports via the `gxp-track` directive or `window.gxp.track()`, so the platform can build reporting around them. Keys are event identifiers; the object value describes the root keys of the event's properties (`gxp-track-props`):

```json
{
	"track-events": {
		"cta.clicked": {
			"placement": "string",
			"variant": ["primary", "secondary"]
		},
		"session.join": {
			"session_id": { "type": "session", "value": "id" }
		},
		"flow.completed": {}
	}
}
```

Each property value is one of:

| Form                                | Meaning                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `"string"`                          | Free-form string value                                                                                              |
| `["a", "b", "c"]`                   | One of a fixed list of allowed values                                                                               |
| `{ "type": "...", "value": "..." }` | Relationship value — a platform model and the field the prop carries (e.g. `{ "type": "attendee", "value": "id" }`) |

Matching template usage:

```html
<button
	gxp-track="cta.clicked"
	gxp-track-props='{"placement": "hero", "variant": "primary"}'
>
	Go
</button>
```

`gxdev extract-config` (and the `config_extract_strings` MCP tool) scans `src/` for `gxp-track` usage and seeds this section automatically — every discovered prop defaults to `"string"`. Refine the entries by hand (allowed-value lists, relationship objects) afterwards; re-extraction never overwrites an existing definition.

## Complete Example

```json
{
	"settings": {
		"primary_color": "#FFD600",
		"secondary_color": "#1976D2",
		"company_name": "TechConf 2024",
		"check_in_timeout": 30,
		"enable_badge_printing": true
	},
	"strings": {
		"default": {
			"welcome_title": "Welcome to TechConf 2024",
			"welcome_subtitle": "Scan your QR code to check in",
			"btn_manual_entry": "Enter Code Manually",
			"btn_help": "Need Help?",
			"success_message": "You're all set!",
			"error_invalid_code": "Invalid code. Please try again.",
			"error_already_checked_in": "You've already checked in."
		}
	},
	"assets": {
		"logo": "/dev-assets/images/techconf-logo.png",
		"hero_background": "/dev-assets/images/hero-bg.jpg",
		"success_animation": "/dev-assets/animations/success.json"
	},
	"triggerState": {
		"is_scanning": false,
		"current_attendee": null,
		"badge_printing": false
	},
	"track-events": {
		"checkin.scan.started": {},
		"checkin.completed": {
			"method": ["qr", "manual"],
			"attendee_id": { "type": "attendee", "value": "id" }
		}
	},
	"dependencies": [],
	"permissions": ["camera"]
}
```

## Directive Reference

| Directive    | Modifier       | Source         | Example                                                    |
| ------------ | -------------- | -------------- | ---------------------------------------------------------- |
| `gxp-string` | (none)         | `stringsList`  | `<h1 gxp-string="title">Default</h1>`                      |
| `gxp-string` | `gxp-settings` | `pluginVars`   | `<span gxp-string="company" gxp-settings>Acme</span>`      |
| `gxp-string` | `gxp-assets`   | `assetList`    | `<span gxp-string="logo_url" gxp-assets>/logo.png</span>`  |
| `gxp-string` | `gxp-state`    | `triggerState` | `<span gxp-string="count" gxp-state>0</span>`              |
| `gxp-src`    | (none)         | `assetList`    | `<img gxp-src="hero" src="/placeholder.jpg" />`            |
| `gxp-src`    | `gxp-state`    | `triggerState` | `<img gxp-src="badge" gxp-state src="/placeholder.jpg" />` |
| `gxp-track`  | (none)         | `track-events` | `<button gxp-track="cta.clicked">Go</button>`              |

## Best Practices

1. **Use descriptive keys** - `welcome_title` is better than `title1`
2. **Provide defaults** - Always include fallback text in your templates
3. **Group related strings** - Keep related strings together for easier management
4. **Use dev-assets for development** - Put placeholder images in `dev-assets/images/`
5. **Keep settings minimal** - Only expose settings that need admin configuration
