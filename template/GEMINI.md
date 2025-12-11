# GxP Plugin Development Context

This is a GxP plugin project for the GxP kiosk platform built with Vue 3.

## Architecture

The plugin runs inside a container provided by the `gxdev` server. Only edit files in `src/`:

- `src/Plugin.vue` - Main entry point
- `src/components/` - Reusable components
- `src/views/` - Page components
- `app-manifest.json` - Configuration (strings, assets, settings)

## Critical Rule: Use GxP Store for API Calls

NEVER use axios or fetch directly. Always use the store's API methods:

```javascript
import { useGxpStore } from '@gx-runtime/stores/gxpPortalConfigStore';
const store = useGxpStore();

// API methods (handles auth, CORS, base URL automatically)
await store.apiGet('/api/v1/endpoint', { params });
await store.apiPost('/api/v1/endpoint', data);
await store.apiPut('/api/v1/endpoint/id', data);
await store.apiPatch('/api/v1/endpoint/id', data);
await store.apiDelete('/api/v1/endpoint/id');
```

## Store Data Access

```javascript
// Getters
store.getString('key', 'default');      // UI strings
store.getSetting('key', 'default');     // Settings
store.getAsset('key', '/fallback.jpg'); // Asset URLs
store.getState('key', null);            // Runtime state

// Setters
store.updateString('key', 'value');
store.updateSetting('key', 'value');
store.updateAsset('key', 'url');
store.updateState('key', 'value');
```

## WebSocket Events

```javascript
// Listen for events
store.listenSocket('primary', 'EventName', (data) => {
  console.log('Event received:', data);
});

// Emit events
store.emitSocket('primary', 'event-name', data);
```

## Vue Directives

```html
<!-- Dynamic text from strings -->
<h1 gxp-string="welcome_title">Default</h1>

<!-- Dynamic images from assets -->
<img gxp-src="hero_image" src="/placeholder.jpg">
```

## Component Kit

Use `@gramercytech/gx-componentkit` for UI:
GxButton, GxCard, GxInput, GxModal, GxSpinner, GxAlert, GxBadge, GxProgress, GxTabs

## Configuration

Edit `app-manifest.json` for strings, assets, settings. Hot-reloads in dev.

## API Specs

- OpenAPI: https://api.zenith-develop.env.eventfinity.app/api-specs/openapi.json
- AsyncAPI: https://api.zenith-develop.env.eventfinity.app/api-specs/asyncapi.json
