# GxP Plugin Development Guidelines

This is a GxP plugin project for the GxP kiosk platform. Follow these guidelines when working with this codebase.

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

The `gxpPortalConfigStore` is the central hub. Import it in any component:

```javascript
import { useGxpStore } from '@gx-runtime/stores/gxpPortalConfigStore';
const store = useGxpStore();
```

## API Calls - ALWAYS Use Store Methods

NEVER use axios or fetch directly. The store handles authentication, base URLs, and CORS:

```javascript
// Correct - use store methods
const data = await store.apiGet('/api/v1/endpoint', { param: 'value' });
await store.apiPost('/api/v1/endpoint', { data: 'value' });
await store.apiPut('/api/v1/endpoint/123', { data: 'value' });
await store.apiPatch('/api/v1/endpoint/123', { data: 'value' });
await store.apiDelete('/api/v1/endpoint/123');

// WRONG - never do this
// const response = await axios.get(...);  // NO!
// const response = await fetch(...);      // NO!
```

## Store Data Access

```javascript
// Get values with fallbacks
store.getString('key', 'default');      // From stringsList
store.getSetting('key', 'default');     // From pluginVars
store.getAsset('key', '/fallback.jpg'); // From assetList
store.getState('key', null);            // From triggerState
store.hasPermission('admin');           // Check permissions

// Update values
store.updateString('key', 'value');
store.updateSetting('key', 'value');
store.updateAsset('key', 'url');
store.updateState('key', 'value');
```

## WebSocket Events

Listen for real-time events through the store:

```javascript
// Listen on primary socket
store.listenSocket('primary', 'EventName', (data) => {
  console.log('Received:', data);
});

// Emit events
store.emitSocket('primary', 'client-event', { data: 'value' });

// For dependency-based sockets
store.useSocketListener('dependency_id', 'updated', callback);
```

## Vue Directives for Dynamic Content

Use these directives instead of hardcoding text and images:

```html
<!-- Text from strings -->
<h1 gxp-string="welcome_title">Fallback Title</h1>

<!-- Text from settings -->
<span gxp-string="company_name" gxp-settings>Company</span>

<!-- Images from assets -->
<img gxp-src="hero_image" src="/placeholder.jpg" alt="Hero">
```

## Component Kit

Import UI components from `@gramercytech/gx-componentkit`:

```javascript
import { GxButton, GxCard, GxInput, GxModal, GxSpinner } from '@gramercytech/gx-componentkit';
```

Available: GxButton, GxCard, GxInput, GxModal, GxSpinner, GxAlert, GxBadge, GxAvatar, GxProgress, GxTabs, GxAccordion

## Configuration

Edit `app-manifest.json` for strings, assets, and settings. Changes hot-reload during development.

## Testing

- Socket events: `gxdev socket send --event EventName`
- Dev Tools: Press Ctrl+Shift+D
- Console: `window.gxDevTools.store()` to inspect store

## API Environments

Set `VITE_API_ENV` in `.env`:
- `mock` - Local mock server (default)
- `develop` - https://api.zenith-develop.env.eventfinity.app
- `staging` - https://api.efz-staging.env.eventfinity.app
- `production` - https://api.gramercy.cloud

## API Documentation

- OpenAPI Spec: https://api.zenith-develop.env.eventfinity.app/api-specs/openapi.json
- AsyncAPI Spec: https://api.zenith-develop.env.eventfinity.app/api-specs/asyncapi.json
- Webhooks: https://api.zenith-develop.env.eventfinity.app/api-specs/webhooks.json
