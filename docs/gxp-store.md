---
sidebar_position: 4
title: GxP Store
description: State management with Pinia and platform integration
---

# GxP Store

The GxP Store (`gxpPortalConfigStore`) is a Pinia store that provides reactive state management and platform integration for your plugin.

:::info One interface, two implementations
On the platform, `useGxpStore()` resolves to the portal's store (Laravel Echo channels, same-origin API). Under `gxdev dev` it resolves to the dev-server store in this package (a local Socket.IO relay, the mock API or the Vite proxy). Both expose **the same state keys and methods with the same behaviour**, so treat the store as a black box: nothing below is dev-only unless it is explicitly marked **dev-only**. The surface is pinned by `tests/runtime/portal-store.test.js`.
:::

## Importing the Store

```javascript
import { useGxpStore } from "@gx-runtime/stores/gxpPortalConfigStore"

// In your component setup
const store = useGxpStore()
```

## Store Sections

The store contains several reactive sections populated from your `app-manifest.json` and the platform:

| Section                   | Description                                                                       | Source (dev / platform)                                          |
| ------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `pluginVars`              | Plugin settings/configuration (also `projectId`, `apiBaseUrl`)                    | `settings` in manifest / admin panel                             |
| `stringsList`             | Translatable strings                                                              | `strings.default` in manifest / platform                         |
| `assetList`               | Asset URLs                                                                        | `assets` in manifest / platform                                  |
| `staticAssetList`         | Static asset URLs (checked by `getAsset` after `assetList`)                       | `staticAssets` in manifest / platform                            |
| `triggerState`            | Dynamic runtime state                                                             | `triggerState` in manifest / state-change events                 |
| `dependencyList`          | Bound dependency ids, keyed by identifier                                         | `dependencies` in manifest / admin panel                         |
| `permissionFlags`         | Granted permissions                                                               | `permissions` in manifest / platform                             |
| `navigationFlagsKeyed`    | Portal page navigation flags, keyed object                                        | `navigationFlags` in manifest / platform                         |
| `auth`                    | `{ user }` — the logged-in attendee, `auth.user` is `null` for guests             | `user`/`auth` in manifest (dev dummy user by default) / platform |
| `userSession`             | Session id string                                                                 | `userSession` in manifest (`"dev-session"`) / platform           |
| `portal` / `portalAssets` | Portal context (`{ id, project_slug, ... }`) and portal-level assets              | `portal`/`portalAssets` in manifest / platform                   |
| `sockets`                 | Named socket objects (`primary`, `project`, `portal`, `attendee`, per-dependency) | see [Sockets](#sockets)                                          |
| `connectionStatus`        | `"connected" \| "connecting" \| "disconnected" \| "unavailable"`                  | socket connection                                                |
| `isOnline`                | Browser `navigator.onLine`, reactive                                              | browser                                                          |
| `quizChannels`            | Channels opened with `connectQuizChannel`                                         | see [Quiz channels](#quiz-channels)                              |
| `theme`                   | Theme colours derived from settings (see [Theme](#theme-integration))             | `settings`                                                       |
| `form`                    | Form store for form-backed apps                                                   | `form` in manifest (dev) / ProjectForm-backed page (platform)    |
| `apiOperations`           | OpenAPI operation registry used by `callApi`                                      | `${apiDocsBaseUrl}/api-specs/openapi.json`                       |
| `pushSubscription`        | Current web-push subscription JSON (or `null`)                                    | see [Web push](#web-push)                                        |
| `user` **(dev-only)**     | Mirror of `auth.user` for the DevTools inspector                                  | —                                                                |

## Getter Methods

Use these methods to safely access store values with fallbacks:

### `getString(key, defaultValue)`

Get a string from `stringsList`:

```javascript
const title = store.getString("welcome_title", "Welcome")
const button = store.getString("btn_submit", "Submit")
```

### `getSetting(key, defaultValue)`

Get a setting from `pluginVars`:

```javascript
const color = store.getSetting("primary_color", "#000000")
const timeout = store.getSetting("idle_timeout", 30)
const enabled = store.getSetting("feature_enabled", false)
```

### `getAsset(key, defaultValue)`

Get an asset URL from `assetList`, falling back to `staticAssetList`, then to an asset whose key matches the fallback's file name, then to the fallback itself:

```javascript
const logo = store.getAsset("logo", "/fallback-logo.png")
const hero = store.getAsset("hero_image", "/placeholder.jpg")
```

### `getState(key, defaultValue)`

Get a value from `triggerState`:

```javascript
const step = store.getState("current_step", 1)
const isActive = store.getState("is_active", false)
```

`getString`, `getSetting` and `getState` use nullish fallback: an explicit `false`, `0` or `""` is returned as-is; only a missing (`null`/`undefined`) key yields the default. `getAsset` is the exception — like the platform, it treats an empty asset URL as unconfigured and falls through.

### `hasPermission(permission)`

Check if a permission is granted:

```javascript
if (store.hasPermission("camera")) {
	// Camera access is available
}

if (store.hasPermission("bluetooth")) {
	// Bluetooth access is available
}
```

### `findDependency(identifier)` / `resolveDependency(identifier)`

```javascript
store.findDependency("form") // raw dependencyList value, e.g. 12 or [12, "#featured"]
store.resolveDependency("form") // { ids: [12], tags: ["featured"], untagged: false }
```

`resolveDependency` parses mixed bindings (`[id, "#tag", "@untagged"]`) into buckets, mirroring the server-side dependency matcher.

### Logged-in user: `auth.user`

The authenticated attendee lives at `store.auth.user`; **it is `null` for guests**, so always guard.

```javascript
const user = store.auth?.user
if (user) {
	console.log("Logged in as", user.id, user.email)
}
```

```javascript
{
  id: string,
  first_name: string,
  last_name: string,
  name: string,           // Display name
  email: string,
  avatar: string | null,  // URL
  roles: string[],        // e.g. ["attendee", "admin"]
  groups: [{ name, slug }], // portal-visible groups the attendee belongs to
}
```

### `getGroups()` / `getGroupNames()` / `getGroupSlugs()` / `inGroup(slug)` / `inAnyGroup(slugs)`

Group membership helpers over `auth.user.groups` (only groups an admin marked portal-visible are present):

```javascript
store.getGroupSlugs() // ["speakers", "vip"]
if (store.inGroup("vip")) showLounge()
if (store.inAnyGroup(["staff", "speakers"])) showBackstage()
```

### `getUser()` / `getUserName(fallback)` / `getUserEmail(fallback)` / `isAuthenticated()` **(dev-only)**

Convenience wrappers around `store.user`, a dev-only mirror of `auth.user`. **They do not exist on the platform** — plugin code must read `store.auth?.user` instead. They remain for the DevTools inspector and older templates.

:::tip Dev dummy user
During `gxdev dev`, `auth.user` is a dummy attendee (`Jane Developer / jane.developer@example.com`, `groups: []`) so plugins can develop against the happy path without a backend. Override it, or simulate a guest, from `app-manifest.json`:

```json
{ "user": { "id": 42, "name": "Sam Speaker", "groups": [{ "name": "Speakers", "slug": "speakers" }] } }
{ "user": null }
```

or open Dev Tools (`Ctrl+Shift+D`) → **Logged-in User** and clear it. Production receives the real user from the platform.
:::

## Update Methods

Plugins should normally write only to `triggerState`; these exist for dev tooling and platform internals.

### `updatePluginVar(key, value)` / `updateSetting(key, value)` **(alias, dev-only)**

Update a setting value:

```javascript
store.updatePluginVar("current_mode", "advanced")
```

### `updateString(key, value)`

Update a string value:

```javascript
store.updateString("dynamic_message", "Processing your request...")
```

### `updateAsset(key, url)`

Update an asset URL:

```javascript
store.updateAsset("user_avatar", "https://example.com/avatar.jpg")
```

### `updateState(key, value)` **(dev-only)**

Update trigger state (on the platform, write `store.triggerState[key] = value`):

```javascript
store.updateState("current_step", 2)
store.updateState("is_loading", true)
store.updateState("selected_item", { id: 123, name: "Item" })
```

### `addDevAsset(key, filename)`

Add a development asset with the dev server URL prefix:

```javascript
// Automatically prefixes with dev server URL
store.addDevAsset("temp_image", "screenshot.png")
// Result: https://localhost:3060/dev-assets/images/screenshot.png
```

### `listAssets()`

Logs and returns `assetList`.

## Dependency API Client

The recommended way to make API calls is through the dependency system using `callApi()`. This method uses the operations defined in your `app-manifest.json` dependencies.

:::info Platform owns admin configuration
The GxP platform itself manages all admin configurations. **Forms, quizzes, surveys, and the quiz builder** are built by admins in the platform UI — your plugin doesn't define fields, questions, scoring rules, or leaderboards. At runtime, your plugin reads the admin-built artifacts (and their questions) through `callApi`. Relevant operation families: `forms.*` (`forms.show`, `forms.fields.index`, `forms.responses.store`, …), `quiz.*` (`quiz.state`, `quiz.questions`, `quiz.answer`, `quiz.leaderboard`, …), and `survey.*` (`survey.metrics`, `survey.live-results`, …). Discover them with the `gxp-api` MCP tools (`api_list_tags`, `search_api_endpoints`, `api_list_operation_ids`).
:::

### `callApi(operationId, identifier, additionalData)`

Call an API operation defined in your dependencies:

```javascript
const store = useGxpStore()

// GET request - list resources
const items = await store.callApi("access-points.index", "access_points")

// GET request - single resource (path parameter)
const item = await store.callApi("access-points.show", "access_points", {
	access_point: 123, // Path parameter
})

// POST request - create resource
const newItem = await store.callApi("access-points.store", "access_points", {
	name: "Main Entrance",
	location: "Building A",
})

// PUT request - update resource
const updated = await store.callApi("access-points.update", "access_points", {
	access_point: 123, // Path parameter
	name: "Updated Name", // Body data
})

// DELETE request
await store.callApi("access-points.destroy", "access_points", {
	access_point: 123,
})
```

**Parameters:**

| Parameter        | Type               | Description                                                                                                             |
| ---------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `operationId`    | string             | The OpenAPI `operationId` (`portal.v1.project.` prefix optional)                                                        |
| `identifier`     | string \| null     | Dependency identifier whose bound id fills the matching path parameter; `null` for team/project-only                    |
| `additionalData` | object \| FormData | Path parameters and/or request body data (optional). Blob/File values or a `FormData` are sent as `multipart/form-data` |

**Returns:** `response.data` from the API response

**File uploads:** pass a `Blob`/`File` in the data object (or a ready `FormData`) and `callApi` switches to multipart automatically — no headers to set:

```javascript
await store.callApi("photos.store", null, {
	photo: fileInput.files[0],
	caption,
})
```

**How it works:**

1. Looks up the dependency by `identifier` in `dependencyList`
2. Finds the operation by `operationId` in the dependency's `operations`
3. Parses the method and path from the operation value (e.g., `"get:/v1/..."`)
4. Substitutes path parameters from `additionalData` (e.g., `{access_point}` → `123`)
5. Makes the HTTP request with remaining data as query params (GET) or body (POST/PUT)
6. Returns `response.data`

**Example with error handling:**

```javascript
try {
	const accessPoints = await store.callApi(
		"access-points.index",
		"access_points",
	)
	console.log("Loaded", accessPoints.length, "access points")
} catch (error) {
	console.error("Failed to load access points:", error.message)
}
```

:::tip Define Dependencies First
Before using `callApi`, make sure you've added the dependency to your `app-manifest.json`. Use `gxdev add-dependency` to generate the configuration automatically.
:::

## Low-Level API Client

For direct API calls without the dependency system, use these methods. Endpoints are resolved against the API host, so — exactly as on the platform — include the `/api` segment yourself (`callApi` adds it for you):

### `apiGet(endpoint, params)`

```javascript
const response = await store.apiGet("/api/v1/projects/acme/expo/events/123")
const events = await store.apiGet("/api/v1/projects/acme/expo/events", {
	status: "active",
})
```

### `apiPost(endpoint, data)`

```javascript
const result = await store.apiPost("/api/v1/projects/acme/expo/checkin", {
	attendee_id: 456,
	timestamp: new Date().toISOString(),
})
```

### `apiPut(endpoint, data)`

```javascript
await store.apiPut("/api/v1/projects/acme/expo/attendees/456", {
	checked_in: true,
})
```

### `apiDelete(endpoint)`

```javascript
await store.apiDelete("/api/v1/projects/acme/expo/sessions/789")
```

`apiPatch(endpoint, data)` also exists but is **dev-only** — the platform store does not provide it.

:::note Where requests go in dev
`API_ENV=mock` → the local mock server; any other `API_ENV` under `gxdev dev` → the Vite proxy at `/api-proxy`, which forwards to that environment's host and injects `API_KEY`. In every case the request path is `/api/v1/...`, the same path the platform sends to the portal origin.
:::

## Form Store (`store.form`)

Form-backed apps (registration forms, quizzes, surveys built on a platform ProjectForm) get a per-form store attached as `store.form` — the same interface plugins see on-platform, so `gxpStore.form.getElements()` works identically in dev and production.

`store.form` is `null` unless one of:

- `app-manifest.json` has a `form` section (or `settings.formId`) — attached automatically, hot-reloaded with the manifest
- the app calls `store.attachFormStore(formKeyOrStore)` explicitly

### Schema Helpers

```javascript
store.form.getSections() // nested sections: { id, title, fields[], sections[] }
store.form.getElements() // flat list of normalized fields
store.form.getElement("first_name") // one field or null
store.form.schema // computed { name, slug, sections } with conditions applied
```

Fields are normalized to guaranteed keys regardless of source shape (v2 `{root, cards, elements}` or plain sections): `slug`, `label`, `type`, `required`, `default_value`, `validation_rules`, `condition_params`.

### Form Data

```javascript
store.form.formData // reactive slug-keyed data object
store.form.getValue("first_name")
store.form.setValue("first_name", "Jane") // also clears the field's error
store.form.setData({ first_name: "Jane", company: "Acme" })
```

`formData` is seeded on initialize: field defaults → `prefillData` → resume-session data.

### Validation

```javascript
store.form.validateField("contact_email") // error string or null
store.form.validateForm() // boolean; populates store.form.errors
store.form.errors // slug-keyed error map
store.form.isValid // computed boolean
```

Supports `required`, type checks (email/phone/number), and Laravel-style string rules (`min`, `max`, `in`, `regex`, `numeric`, `email`). The server remains authoritative.

### Conditional Visibility

```javascript
store.form.setConditionalProcessing(true) // or "conditions": true in the manifest
```

When enabled, `getSections()`/`getElements()` evaluate each node's `condition_params` against `formData`, and hidden fields are skipped by validation.

### Submission

```javascript
const result = await store.form.submit()
await store.form.confirmUpdateExisting(attendeeId) // after a 409 duplicate prompt
await store.form.saveProgress("jane@example.com") // resumable forms
store.form.processing / store.form.submitted / store.form.lastResult
```

In dev, `submit()` resolves in order:

1. `form.mockResponses.submit` from the manifest (returned verbatim)
2. A real POST to the registration-form API under the configured `apiBaseUrl` (mock API or a real environment via the dev proxy)
3. A simulated `{ success: true, simulated: true }` result

Every delivery is logged to the console and broadcast as a `gxp:form-submit` CustomEvent on `window`. Real 422 responses map onto `store.form.errors`; 409 duplicate payloads are returned so the app can prompt.

### Manifest Configuration

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
					"elementList": ["el-1"]
				}
			},
			"elements": {
				"el-1": {
					"id": "el-1",
					"name": "first_name",
					"type": "input",
					"label": "First Name",
					"required": true
				}
			}
		},
		"prefillData": { "first_name": "Jane" },
		"conditions": true,
		"mockResponses": { "submit": { "success": true, "status": "created" } }
	}
}
```

`schema` accepts the v2 shape (`{ root, cards, elements }`) or `{ sections: [...] }`; a top-level `sections` array also works. Like the other manifest sections, the form store is rebuilt on manifest hot-reload (unsaved `formData` resets).

## Sockets

`store.sockets` holds named socket objects. On the platform each is a Laravel Echo channel; in dev they all ride one Socket.IO connection to the local relay (`gxdev dev` starts it; `gxdev socket send <event>` injects events). The objects look and behave the same in both.

| Socket                 | When present                        | Methods                                                                                                  |
| ---------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `sockets.primary`      | always                              | `broadcast(event, data)`, `listen(event, cb)`, `listenForWhisper(event, cb)`, `listenForStateChange(cb)` |
| `sockets.project`      | portal context has a `project_slug` | `broadcast`, `listen`, `listenForWhisper`                                                                |
| `sockets.portal`       | portal context has a `project_slug` | `broadcast`, `listen`, `listenForWhisper`                                                                |
| `sockets.attendee`     | a user is logged in                 | `notification(cb)`, `listen(_event, cb)`                                                                 |
| `sockets.<identifier>` | dependency declares `events`        | `<eventType>.listen(cb)` per declared event                                                              |

**Every `listen*` returns an unsubscribe function** — call it on unmount. There are no `stopListening*` methods.

```javascript
const off = store.sockets.primary.listen("checkin-complete", onCheckin)
onUnmounted(off)

// State changes: merges e.changes into triggerState, then calls back
store.sockets.primary.listenForStateChange((e) => console.log(e.changes))

// Dependency events (declared in the manifest / admin panel)
const stop = store.sockets.ai_interface.completed.listen(onResult)
```

### `broadcast(socketName, event, data)` / `listen(socketName, event, callback)`

Shorthand for the named socket's methods. `listen` returns the unsubscriber (a no-op function if the socket doesn't exist):

```javascript
store.broadcast("primary", "checkin-complete", { attendee_id: 123 })
const off = store.listen("primary", "session-updated", (data) => {
	store.triggerState.current_session = data
})
```

`emitSocket`, `listenSocket` and `useSocketListener` are deprecated aliases of `broadcast`/`listen` and still work.

**Dev-only:** `listen(eventName, permissionIdentifier, callback)` additionally subscribes to an AsyncAPI platform event on the primary socket when the first argument is not a registered socket name.

### Quiz channels

```javascript
const { channel, echo, leave } = store.connectQuizChannel(formId) // cached per formId
channel.listen(".QuizStateChanged", onState) // Echo-shaped channel object
store.leaveQuizChannel(formId)
await store.resyncQuizState(formId) // callApi("portal.v1.project.quiz.state", "form", { form: formId })
```

`store.quizChannels[formId]` holds the open entries.

### Connection state

`store.connectionStatus` reflects the socket connection (`"connected"`, `"connecting"`, `"disconnected"`, `"unavailable"`); `store.isOnline` reflects the browser's connectivity.

### Dev relay notes

The relay rebroadcasts every event to every other client, so `project`/`portal`/quiz "channels" share the wire with `primary` in dev — pick distinct event names. The attendee inbox arrives as a plain `notification` event (`gxdev socket send notification '{...}'`).

## Web push

Same API as the platform. In dev, set `PUSH_NOTIFICATIONS_ENABLED=true` and `VAPID_PUBLIC_KEY` in `.env` to exercise a real service-worker subscription; unset, the helpers behave exactly as the platform does when push is unavailable.

```javascript
store.pushSubscription // current subscription JSON or null
await store.loadPushSubscription() // browser subscription or null
await store.ensurePushSubscription(deviceFingerprint) // re-subscribes silently when permitted, else null
await store.subscribeToPush(deviceFingerprint) // throws when unsupported / no VAPID key / server rejects
await store.unsubscribeFromPush()
```

## Lifecycle (platform internals)

`initializeData(payload)`, `initializeSockets()`, `initializeApiOperations()`, `reset()` and `destroy()` are what the platform page calls to seed and tear down the store. They exist in dev too — `initializeData` accepts the same payload shape — which is handy for harnesses and tests, but a plugin never needs to call them.

## Reactive Usage in Templates

The store is fully reactive. Use it directly in your templates:

```vue
<template>
	<div :style="{ backgroundColor: store.getSetting('bg_color', '#fff') }">
		<h1>{{ store.getString("title", "Default Title") }}</h1>

		<p v-if="store.triggerState.is_loading">Loading...</p>

		<div v-for="item in store.triggerState.items" :key="item.id">
			{{ item.name }}
		</div>
	</div>
</template>

<script setup>
import { useGxpStore } from "@gx-runtime/stores/gxpPortalConfigStore"

const store = useGxpStore()
</script>
```

## Watching Store Changes

Use Vue's `watch` to react to store changes:

```javascript
import { watch } from "vue"
import { useGxpStore } from "@gx-runtime/stores/gxpPortalConfigStore"

const store = useGxpStore()

// Watch a specific state value
watch(
	() => store.triggerState.current_step,
	(newStep, oldStep) => {
		console.log(`Step changed from ${oldStep} to ${newStep}`)
	},
)

// Watch multiple values
watch(
	() => [store.triggerState.is_active, store.pluginVars.mode],
	([isActive, mode]) => {
		if (isActive && mode === "kiosk") {
			startKioskMode()
		}
	},
)
```

## Computed Properties

Create computed properties based on store values:

```javascript
import { computed } from "vue"
import { useGxpStore } from "@gx-runtime/stores/gxpPortalConfigStore"

const store = useGxpStore()

const isReady = computed(
	() => !store.triggerState.is_loading && store.triggerState.data !== null,
)

const formattedCount = computed(
	() =>
		`${store.triggerState.checked_in_count} of ${store.pluginVars.total_expected}`,
)
```

## Theme Integration

`store.theme` is computed from settings with the platform's defaults:

| Key                      | Setting read             | Default                                             |
| ------------------------ | ------------------------ | --------------------------------------------------- |
| `background_color`       | `background_color`       | `#ffffff`                                           |
| `text_color`             | `text_color`             | `#333333`                                           |
| `primary_color`          | `primary_color`          | `#FFD600`                                           |
| `start_background_color` | `start_background_color` | `linear-gradient(135deg, #667eea 0%, #764ba2 100%)` |
| `start_text_color`       | `start_text_color`       | `#ffffff`                                           |
| `final_background_color` | `final_background_color` | `#4CAF50`                                           |
| `final_text_color`       | `final_text_color`       | `#ffffff`                                           |

```javascript
const store = useGxpStore()

const buttonStyle = computed(() => ({
	backgroundColor: store.theme.primary_color,
	color: store.theme.text_color,
}))
```

Anything beyond these keys is a plugin setting — read it with `store.getSetting(...)`.

## Best Practices

1. **Use getters with defaults** - Always provide fallback values
2. **Keep state updates atomic** - Update one value at a time when possible
3. **Use computed for derived state** - Don't duplicate logic
4. **Clean up listeners** - Call the unsubscriber returned by `listen*` when components unmount
5. **Avoid deep nesting** - Keep `triggerState` relatively flat for reactivity
6. **Stay on the platform surface** - Anything marked **dev-only** above (`user`, `getUser*`, `apiPatch`, `updateSetting`, `updateState`, `manifestLoaded`, `loadManifest`) is not available once deployed; use `auth.user`, `triggerState`, and the platform methods instead
