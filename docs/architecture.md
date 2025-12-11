---
sidebar_position: 11
title: Project Architecture
description: Understanding the GxP Toolkit architecture and plugin structure
---

# Project Architecture

This guide explains the architecture of the GxP Toolkit and how plugins are structured.

## Overview

The GxP Toolkit has two main parts:

1. **Toolkit Package** (`@gxp-dev/tools`) - Installed in `node_modules/`
2. **Your Plugin Project** - Your custom code and configuration

```
Your Project
├── Your Code (src/, theme-layouts/)
├── Configuration (app-manifest.json, .env)
└── node_modules/
    └── @gxp-dev/tools/
        ├── Runtime files (loaded at runtime)
        ├── CLI tool (gxdev commands)
        └── Browser extensions
```

## Toolkit Directory Structure

```
@gxp-dev/tools/
├── bin/                        # CLI Tool
│   ├── gx-devtools.js          # Main entry point
│   └── lib/
│       ├── cli.js              # Yargs command setup
│       ├── constants.js        # Shared constants
│       ├── commands/           # CLI command implementations
│       │   ├── init.js         # gxdev init
│       │   ├── dev.js          # gxdev dev
│       │   ├── build.js        # gxdev build
│       │   ├── datastore.js    # gxdev datastore
│       │   ├── socket.js       # gxdev socket
│       │   ├── assets.js       # gxdev assets
│       │   ├── extensions.js   # gxdev ext:*
│       │   ├── ssl.js          # gxdev setup-ssl
│       │   └── publish.js      # gxdev publish
│       ├── utils/              # Utility functions
│       └── tui/                # Interactive TUI (TypeScript/Ink)
│           ├── index.tsx
│           ├── App.tsx
│           ├── components/
│           └── services/
├── runtime/                    # Runtime files (used from node_modules)
│   ├── PortalContainer.vue     # Platform emulator
│   ├── gxpStringsPlugin.js     # Vue directives plugin
│   ├── main.js                 # Dev entry point
│   ├── vite.config.js          # Vite configuration
│   ├── index.html              # Dev HTML template
│   ├── server.js               # Socket.IO server
│   ├── stores/
│   │   └── gxpPortalConfigStore.js  # Pinia store
│   └── dev-tools/              # In-browser dev tools
│       ├── DevToolsModal.vue
│       ├── StoreInspector.vue
│       ├── LayoutSwitcher.vue
│       ├── SocketSimulator.vue
│       └── MockDataEditor.vue
├── template/                   # Files copied to projects
│   ├── src/
│   │   ├── Plugin.vue          # Main plugin component
│   │   ├── DemoPage.vue        # Example component
│   │   └── stores/index.js     # Store setup
│   ├── theme-layouts/          # Layout components
│   ├── app-manifest.json       # Plugin configuration
│   ├── configuration.json      # Additional config
│   └── ...
├── socket-events/              # Socket event templates
├── browser-extensions/         # Chrome/Firefox extensions
│   ├── chrome/
│   └── firefox/
├── scripts/                    # Utility scripts
└── dist/                       # Compiled TUI
```

## Runtime vs Template

Understanding the difference between runtime and template files is crucial:

### Runtime Files (`runtime/`)

- **Stay in node_modules** - Not copied to your project
- **Imported at runtime** via `@gx-runtime` alias
- **Shared across projects** - Updates come from npm
- **Immutable by default** - Use `gxdev publish` to customize

Key runtime files:
| File | Purpose |
|------|---------|
| `PortalContainer.vue` | Platform emulator wrapper |
| `gxpPortalConfigStore.js` | Central Pinia store |
| `gxpStringsPlugin.js` | Vue directives |
| `main.js` | Development entry point |
| `vite.config.js` | Build configuration |
| `server.js` | Socket.IO server |
| `dev-tools/*.vue` | In-browser debugging tools |

### Template Files (`template/`)

- **Copied to your project** during `gxdev init`
- **Owned by you** - Customize freely
- **Won't be overwritten** - Safe to modify

Key template files:
| File | Purpose |
|------|---------|
| `src/Plugin.vue` | Your main component |
| `src/DemoPage.vue` | Example component |
| `theme-layouts/*.vue` | Layout wrappers |
| `app-manifest.json` | Plugin configuration |
| `.env` | Environment variables |

## Plugin Project Structure

After `gxdev init`, your project looks like:

```
my-plugin/
├── src/
│   ├── Plugin.vue              # ← Your main entry point
│   ├── DemoPage.vue            # ← Example (can delete)
│   ├── assets/                 # ← Your static assets
│   │   └── .gitkeep
│   └── stores/
│       └── index.js            # ← Pinia setup
├── theme-layouts/
│   ├── PublicLayout.vue        # ← Public layout wrapper
│   ├── PrivateLayout.vue       # ← Authenticated layout
│   ├── SystemLayout.vue        # ← Admin layout
│   └── AdditionalStyling.css   # ← Extra CSS
├── socket-events/              # ← Socket event templates
├── scripts/
│   └── launch-chrome.js        # ← Chrome launcher
├── dev-assets/                 # ← Development placeholder assets
│   └── images/
├── app-manifest.json           # ← Plugin configuration
├── configuration.json          # ← Additional configuration
├── app-instructions.md         # ← Plugin documentation
├── default-styling.css         # ← Default CSS
├── .env                        # ← Environment variables
├── .env.example                # ← Environment template
├── .gitignore
├── package.json
└── README.md
```

## Vite Aliases

The toolkit configures these path aliases in `vite.config.js`:

| Alias | Points To | Usage |
|-------|-----------|-------|
| `@` | `./src/` | Your components |
| `@layouts` | `./theme-layouts/` | Layout components |
| `@gx-runtime` | `node_modules/.../runtime/` | Toolkit runtime |

Example imports:
```javascript
import MyComponent from '@/components/MyComponent.vue';
import PublicLayout from '@layouts/PublicLayout.vue';
import { useGxpStore } from '@gx-runtime/stores/gxpPortalConfigStore';
```

## Plugin Architecture

### Component Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│ PortalContainer.vue (runtime)                               │
│   - Platform emulator                                       │
│   - Provides mock router, theme, data                       │
│   - Injects props to Plugin                                 │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Layout (PublicLayout/PrivateLayout/SystemLayout)        │ │
│ │   - Layout wrapper                                       │ │
│ │   - Header, footer, navigation                          │ │
│ │                                                          │ │
│ │ ┌───────────────────────────────────────────────────┐   │ │
│ │ │ Plugin.vue (your code)                             │   │ │
│ │ │   - Your main component                            │   │ │
│ │ │   - Receives injected props                        │   │ │
│ │ │                                                     │   │ │
│ │ │ ┌───────────────────────────────────────────────┐ │   │ │
│ │ │ │ Your Components                                │ │   │ │
│ │ │ │   - DemoPage, forms, etc.                     │ │   │ │
│ │ │ └───────────────────────────────────────────────┘ │   │ │
│ │ └───────────────────────────────────────────────────┘   │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Injected Props

The platform injects these props into your Plugin component:

| Prop | Type | Description |
|------|------|-------------|
| `pluginVars` | Object | Settings from manifest |
| `stringsList` | Object | Translatable strings |
| `assetUrls` | Object | Asset URLs |
| `dependencyList` | Array | External dependencies |
| `permissionFlags` | Array | Granted permissions |
| `theme` | Object | Platform theme colors |
| `router` | Object | Navigation methods |
| `triggerState` | Object | Dynamic runtime state |

In development, these come from `app-manifest.json`. In production, the platform provides them.

## Data Flow

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ app-manifest.json │────▶│    GxP Store     │────▶│  Your Components │
└──────────────────┘     │  (Pinia)         │     └──────────────────┘
                         │                  │              │
                         │  - pluginVars    │              │
                         │  - stringsList   │              │
                         │  - assetList     │              ▼
                         │  - triggerState  │     ┌──────────────────┐
                         │                  │     │   gxp-string     │
                         └──────────────────┘     │   gxp-src        │
                                 │                │   directives     │
                                 │                └──────────────────┘
                                 ▼
                         ┌──────────────────┐
                         │   Dev Tools      │
                         │  (Ctrl+Shift+D)  │
                         └──────────────────┘
```

### Store Initialization

1. **Store created** - Default values loaded
2. **Manifest fetched** - `app-manifest.json` loaded via HTTP
3. **Store updated** - Manifest values applied
4. **Directives update** - `gxp-string`/`gxp-src` elements refresh
5. **Hot reload** - Changes to manifest trigger updates

## Build Process

### Development (`gxdev dev`)

```
Your Code                    Runtime Files
    │                            │
    ▼                            ▼
┌─────────┐               ┌─────────────┐
│  Vite   │◀──────────────│ vite.config │
│  Dev    │               │   (runtime) │
│ Server  │               └─────────────┘
└─────────┘
    │
    ▼
┌─────────────────────────────────────┐
│        Development Server           │
│  - Hot Module Replacement           │
│  - Manifest hot-reload              │
│  - Source maps                      │
│  - Dev tools (Ctrl+Shift+D)         │
└─────────────────────────────────────┘
```

### Production (`gxdev build`)

```
src/Plugin.vue
    │
    ▼
┌─────────┐     ┌─────────────┐
│  Vite   │────▶│  dist/build │
│  Build  │     │  - plugin.es.js
└─────────┘     │  - plugin.es.css
                │  - app-manifest.json
                │  - assets/
                └─────────────┘
                      │
                      ▼
                ┌─────────────┐
                │  .gxpapp    │
                │  (ZIP file) │
                └─────────────┘
```

### Build Output

```
dist/
├── build/
│   ├── plugin.es.js          # Main bundle (ES module)
│   ├── plugin.es.css         # Extracted styles
│   ├── app-manifest.json     # Cleaned manifest
│   ├── assets/               # From src/assets/
│   ├── appInstructions.md    # Optional
│   ├── default-styling.css   # Optional
│   └── configuration.json    # Optional
└── my-plugin.gxpapp          # Deployable package
```

## Socket.IO Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Your Plugin    │────▶│   Socket.IO     │◀────│  Socket Events  │
│  (Browser)      │     │   Server        │     │  (JSON files)   │
└─────────────────┘     │  (Node.js)      │     └─────────────────┘
                        └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │   GxP Store     │
                        │  socket methods │
                        └─────────────────┘
```

### Socket Channels

Events are sent on channels following the pattern:
```
private.{Model}.{identifier}
```

Example: `private.AiInterface.ai_session_123`

## Customizing Runtime Files

To customize runtime files, use `gxdev publish`:

```bash
# Copy server.js to project root
gxdev publish server.js

# Copy store to src/stores/
gxdev publish gxpPortalConfigStore.js

# Copy Vite config
gxdev publish vite.config.js
```

Once published, the local copy takes precedence over the runtime version.

## Extension Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Browser                                                     │
│                                                             │
│ ┌───────────────────────┐    ┌──────────────────────────┐  │
│ │ DevTools Panel        │    │ Your Plugin Page         │  │
│ │ (panel.html)          │    │                          │  │
│ │                       │    │ ┌──────────────────────┐ │  │
│ │ - Element inspector   │◀───│ │ Content Script       │ │  │
│ │ - Component viewer    │    │ │ (content.js)         │ │  │
│ │ - String extractor    │    │ │                      │ │  │
│ └───────────────────────┘    │ │ - DOM inspection     │ │  │
│         │                    │ │ - Vue detection      │ │  │
│         ▼                    │ │ - Highlighting       │ │  │
│ ┌───────────────────────┐    │ └──────────────────────┘ │  │
│ │ Background Script     │    └──────────────────────────┘  │
│ │ (background.js)       │                                  │
│ └───────────────────────┘                                  │
└─────────────────────────────────────────────────────────────┘
```

## File Ownership Summary

| File/Directory | Owner | Customizable |
|----------------|-------|--------------|
| `src/` | You | Yes |
| `theme-layouts/` | You | Yes |
| `app-manifest.json` | You | Yes |
| `.env` | You | Yes |
| `socket-events/` | You | Yes |
| `dev-assets/` | You | Yes |
| `PortalContainer.vue` | Toolkit | Via publish |
| `gxpPortalConfigStore.js` | Toolkit | Via publish |
| `vite.config.js` | Toolkit | Via publish |
| `server.js` | Toolkit | Via publish |
| Browser extensions | Toolkit | No |

## Best Practices

### 1. Don't Modify node_modules

Always use `gxdev publish` to customize runtime files. Never edit files directly in `node_modules/`.

### 2. Keep Plugin.vue Clean

Use Plugin.vue as a thin wrapper that imports your actual components:

```vue
<template>
  <component :is="currentView" />
</template>

<script setup>
import { ref } from 'vue';
import WelcomeView from '@/views/WelcomeView.vue';
import CheckInView from '@/views/CheckInView.vue';

const currentView = ref(WelcomeView);
</script>
```

### 3. Use the Store

Don't pass props through multiple components. Use the store directly:

```vue
<script setup>
import { useGxpStore } from '@gx-runtime/stores/gxpPortalConfigStore';
const store = useGxpStore();
</script>
```

### 4. Organize by Feature

```
src/
├── Plugin.vue
├── views/
│   ├── WelcomeView.vue
│   ├── CheckInView.vue
│   └── ConfirmationView.vue
├── components/
│   ├── forms/
│   ├── buttons/
│   └── cards/
└── composables/
    └── useCheckIn.js
```

### 5. Keep Manifest Organized

Group related strings and settings:

```json
{
  "strings": {
    "default": {
      "checkin_title": "...",
      "checkin_subtitle": "...",
      "checkin_btn_submit": "...",
      "welcome_title": "...",
      "welcome_subtitle": "..."
    }
  }
}
```
