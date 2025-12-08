---
sidebar_position: 4
title: GxP Store
description: State management with Pinia and platform integration
---

# GxP Store

The GxP Store (`gxpPortalConfigStore`) is a Pinia store that provides reactive state management and platform integration for your plugin.

## Importing the Store

```javascript
import { useGxpStore } from '@gx-runtime/stores/gxpPortalConfigStore';

// In your component setup
const store = useGxpStore();
```

## Store Sections

The store contains several reactive sections populated from your `app-manifest.json` and the platform:

| Section | Description | Source |
|---------|-------------|--------|
| `pluginVars` | Plugin settings/configuration | `settings` in manifest |
| `stringsList` | Translatable strings | `strings.default` in manifest |
| `assetList` | Asset URLs | `assets` in manifest |
| `triggerState` | Dynamic runtime state | `triggerState` in manifest |
| `dependencyList` | External dependencies | Platform-injected |
| `permissionFlags` | Granted permissions | Platform-injected |
| `theme` | Platform theme colors | Platform-injected |
| `router` | Navigation methods | Platform-injected |

## Getter Methods

Use these methods to safely access store values with fallbacks:

### `getString(key, defaultValue)`

Get a string from `stringsList`:

```javascript
const title = store.getString('welcome_title', 'Welcome');
const button = store.getString('btn_submit', 'Submit');
```

### `getSetting(key, defaultValue)`

Get a setting from `pluginVars`:

```javascript
const color = store.getSetting('primary_color', '#000000');
const timeout = store.getSetting('idle_timeout', 30);
const enabled = store.getSetting('feature_enabled', false);
```

### `getAsset(key, defaultValue)`

Get an asset URL from `assetList`:

```javascript
const logo = store.getAsset('logo', '/fallback-logo.png');
const hero = store.getAsset('hero_image', '/placeholder.jpg');
```

### `getState(key, defaultValue)`

Get a value from `triggerState`:

```javascript
const step = store.getState('current_step', 1);
const isActive = store.getState('is_active', false);
```

### `hasPermission(permission)`

Check if a permission is granted:

```javascript
if (store.hasPermission('camera')) {
  // Camera access is available
}

if (store.hasPermission('bluetooth')) {
  // Bluetooth access is available
}
```

## Update Methods

### `updateString(key, value)`

Update a string value:

```javascript
store.updateString('dynamic_message', 'Processing your request...');
```

### `updateSetting(key, value)`

Update a setting value:

```javascript
store.updateSetting('current_mode', 'advanced');
```

### `updateAsset(key, url)`

Update an asset URL:

```javascript
store.updateAsset('user_avatar', 'https://example.com/avatar.jpg');
```

### `updateState(key, value)`

Update trigger state:

```javascript
store.updateState('current_step', 2);
store.updateState('is_loading', true);
store.updateState('selected_item', { id: 123, name: 'Item' });
```

### `addDevAsset(key, filename)`

Add a development asset with the dev server URL prefix:

```javascript
// Automatically prefixes with dev server URL
store.addDevAsset('temp_image', 'screenshot.png');
// Result: https://localhost:3060/dev-assets/images/screenshot.png
```

## API Client

The store includes an Axios-based API client for making HTTP requests:

### `apiGet(endpoint, params)`

```javascript
const response = await store.apiGet('/events/123');
const events = await store.apiGet('/events', { status: 'active' });
```

### `apiPost(endpoint, data)`

```javascript
const result = await store.apiPost('/checkin', {
  attendee_id: 456,
  timestamp: new Date().toISOString()
});
```

### `apiPut(endpoint, data)`

```javascript
await store.apiPut('/attendees/456', {
  checked_in: true
});
```

### `apiDelete(endpoint)`

```javascript
await store.apiDelete('/sessions/789');
```

## Socket.IO Integration

The store provides methods for real-time communication via Socket.IO:

### `emitSocket(channel, event, data)`

Send a socket event:

```javascript
store.emitSocket('primary', 'checkin-complete', {
  attendee_id: 123,
  badge_printed: true
});
```

### `listenSocket(channel, event, callback)`

Listen for socket events:

```javascript
store.listenSocket('primary', 'session-updated', (data) => {
  console.log('Session updated:', data);
  store.updateState('current_session', data);
});
```

### `useSocketListener(dependencyId, event, callback)`

Set up a socket listener for a specific dependency:

```javascript
store.useSocketListener('badge-printer', 'print-complete', (result) => {
  if (result.success) {
    store.updateState('badge_printing', false);
  }
});
```

## Reactive Usage in Templates

The store is fully reactive. Use it directly in your templates:

```vue
<template>
  <div :style="{ backgroundColor: store.getSetting('bg_color', '#fff') }">
    <h1>{{ store.getString('title', 'Default Title') }}</h1>

    <p v-if="store.triggerState.is_loading">Loading...</p>

    <div v-for="item in store.triggerState.items" :key="item.id">
      {{ item.name }}
    </div>
  </div>
</template>

<script setup>
import { useGxpStore } from '@gx-runtime/stores/gxpPortalConfigStore';

const store = useGxpStore();
</script>
```

## Watching Store Changes

Use Vue's `watch` to react to store changes:

```javascript
import { watch } from 'vue';
import { useGxpStore } from '@gx-runtime/stores/gxpPortalConfigStore';

const store = useGxpStore();

// Watch a specific state value
watch(
  () => store.triggerState.current_step,
  (newStep, oldStep) => {
    console.log(`Step changed from ${oldStep} to ${newStep}`);
  }
);

// Watch multiple values
watch(
  () => [store.triggerState.is_active, store.pluginVars.mode],
  ([isActive, mode]) => {
    if (isActive && mode === 'kiosk') {
      startKioskMode();
    }
  }
);
```

## Computed Properties

Create computed properties based on store values:

```javascript
import { computed } from 'vue';
import { useGxpStore } from '@gx-runtime/stores/gxpPortalConfigStore';

const store = useGxpStore();

const isReady = computed(() =>
  !store.triggerState.is_loading &&
  store.triggerState.data !== null
);

const formattedCount = computed(() =>
  `${store.triggerState.checked_in_count} of ${store.pluginVars.total_expected}`
);
```

## Theme Integration

Access platform theme values:

```javascript
const store = useGxpStore();

// Theme colors
const primaryColor = store.theme?.primary || '#1976D2';
const backgroundColor = store.theme?.background || '#ffffff';

// Use in styles
const buttonStyle = computed(() => ({
  backgroundColor: store.theme?.primary,
  color: store.theme?.onPrimary
}));
```

## Best Practices

1. **Use getters with defaults** - Always provide fallback values
2. **Keep state updates atomic** - Update one value at a time when possible
3. **Use computed for derived state** - Don't duplicate logic
4. **Clean up listeners** - Remove socket listeners when components unmount
5. **Avoid deep nesting** - Keep `triggerState` relatively flat for reactivity
