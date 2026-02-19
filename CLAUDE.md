# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GxP Dev Devtools (`@gxp-dev/tools`) is a package for creating platform plugins for the GxP kiosk platform. It provides:

## Quick Start (New Developer)

```bash
# 1. Clone and install dependencies
git clone <repo>
cd gx-devtools
npm install

# 2. Build the TUI (required for CLI to work)
npm run build:tui

# 3. Link the package globally for local development
npm link

# 4. Create a new test project
mkdir ~/test-plugin && cd ~/test-plugin
gxdev init my-plugin

# 5. Start development
gxdev dev --no-https  # or just: npm run dev-http
```

## Adding to an Existing Project

If you already have a Vue/Vite project, you can add the toolkit without scaffolding a new one:

```bash
cd ~/my-existing-project
gxdev init
```

When run in a directory with an existing `package.json` (and no project name argument), `gxdev init` will:
- Add missing required dependencies and devDependencies to `package.json`
- Update mismatched dependency versions to the toolkit's expected versions
- Add missing npm scripts (`dev`, `build`, `dev-http`, etc.)
- Rename your existing `vite.config.js` to `vite.config.js.backup`
- Copy bundle files: `app-manifest.json`, `.env.example`, store setup, config files, and AI agent configs

It will **not** overwrite your source files (`src/Plugin.vue`, `src/DemoPage.vue`, `theme-layouts/`, etc.).

By default, the dev server uses `index.html` and `main.js` from the toolkit runtime. If your project needs custom versions of these files, set the env vars in `.env`:
```env
USE_LOCAL_INDEX=true
USE_LOCAL_MAIN=true
```
Both the env var and the corresponding local file must exist for the override to take effect.

## Features

GxP Dev Devtools provides:
- CLI tool (`gxdev`) for project scaffolding and development
- Interactive TUI (Terminal UI) for managing dev services
- Vite-based development server with HTTPS support
- Socket.IO server for real-time event simulation
- Browser extensions (Chrome/Firefox) for testing plugins in production environments
- Project templates with Vue 3 and Pinia integration
- GxP Strings Plugin for reactive string/asset replacement

## Common Commands

```bash
# Development
npm run dev              # Start HTTPS dev server with Socket.IO
npm run dev-app          # Start HTTPS dev server only
npm run dev-http         # Start HTTP dev server (no SSL)
npm run build            # Build plugin for production

# SSL Setup
npm run setup-ssl        # Generate SSL certificates via mkcert

# CLI Commands (gxdev)
gxdev                     # Launch interactive TUI
gxdev init [name]         # Create new project or update existing
gxdev dev                 # Start dev server (Vite + Socket.IO)
gxdev dev --no-https      # Start without SSL
gxdev dev --no-socket     # Start Vite only (no Socket.IO)
gxdev dev --with-mock     # Start with Mock API enabled
gxdev dev --chrome        # Start dev server and launch Chrome with extension
gxdev dev --firefox       # Start dev server and launch Firefox with extension
gxdev build               # Build for production
gxdev publish <file>      # Copy package files to local project

# Datastore Management
gxdev datastore list      # List store variables
gxdev datastore add       # Add new variable
gxdev datastore scan-strings  # Scan components for hardcoded strings

# Socket Simulation
gxdev socket list         # List available socket events
gxdev socket send --event <EventName>  # Send test socket event

# Asset Management
gxdev assets list         # List development assets
gxdev assets init         # Initialize asset directories
gxdev assets generate --size 400x300 --name placeholder  # Generate placeholder images

# Browser Extensions
gxdev ext:firefox         # Launch Firefox with extension
gxdev ext:chrome          # Launch Chrome with extension
gxdev ext:build           # Build extensions for distribution
```

## Architecture

### Directory Structure
```
gx-devtools/
├── bin/                    # CLI tool
│   ├── gx-devtools.js       # Main CLI entry point
│   └── lib/
│       ├── cli.js          # Yargs CLI setup and command routing
│       ├── constants.js    # Shared constants (dependencies, scripts, ports)
│       ├── commands/       # Command modules (init, dev, build, etc.)
│       ├── utils/          # Utility modules (paths, ssl, files, prompts)
│       └── tui/            # Interactive Terminal UI (TypeScript/Ink)
│           ├── index.tsx   # TUI entry point
│           ├── App.tsx     # Main Ink application
│           ├── components/ # UI components (Header, TabBar, LogPanel, etc.)
│           ├── services/   # Service managers (Vite, Socket, Extensions)
│           └── commands/   # TUI slash command handlers
├── runtime/                # Files used from node_modules (NOT copied to projects)
│   ├── PortalContainer.vue # Platform emulator
│   ├── server.js           # Socket.IO server
│   ├── gxpStringsPlugin.js # Vue plugin for gxp-string/gxp-src directives
│   ├── fallback-layouts/   # Fallback layouts for projects without theme-layouts/
│   │   ├── PublicLayout.vue
│   │   ├── PrivateLayout.vue
│   │   ├── SystemLayout.vue
│   │   └── AdditionalStyling.css
│   ├── dev-tools/          # In-browser development tools
│   │   ├── DevToolsModal.vue
│   │   ├── StoreInspector.vue  # Store inspector with element highlighting
│   │   ├── LayoutSwitcher.vue
│   │   ├── SocketSimulator.vue
│   │   └── MockDataEditor.vue
│   └── stores/
│       └── gxpPortalConfigStore.js  # Core Pinia store
├── template/               # Files copied to new projects during `gxdev init`
│   ├── src/
│   │   ├── Plugin.vue      # User's app entry point
│   │   ├── DemoPage.vue    # Example component with gxp-string usage
│   │   └── stores/         # Store setup
│   ├── theme-layouts/      # Layout components (System, Private, Public)
│   ├── dev-assets/images/  # Placeholder images for development
│   ├── main.js             # Dev entry point
│   ├── vite.config.js      # Project vite config
│   ├── app-manifest.json   # Configuration manifest (settings, strings, assets)
│   └── index.html          # Dev HTML template
├── socket-events/          # Socket event templates for simulation
├── browser-extensions/     # Chrome and Firefox extensions
│   ├── chrome/             # Manifest V3 extension with DevTools panel
│   └── firefox/            # Firefox-compatible extension
├── scripts/                # Browser extension launch/pack scripts
└── dist/                   # Compiled TUI output
```

### Key Concepts

**Runtime vs Template:**
- `/runtime/` - Files that stay in node_modules and are imported at runtime. Includes `index.html` and `main.js` which are served by the Vite dev server by default (no local copy needed). Set `USE_LOCAL_INDEX`/`USE_LOCAL_MAIN` env vars to override with local copies.
- `/template/` - Files copied to user projects during `gxdev init` (new projects get all files; existing projects only get bundle/config files)

**Plugin Architecture:**
1. **PortalContainer.vue** (runtime) - Platform emulator with mock router, theme, data
2. **Plugin.vue** (template) - User's app entry point, compiled for production
3. Props injected by platform: `pluginVars`, `dependencyList`, `assetUrls`, `stringsList`, `permissionFlags`, `theme`, `router`

**Vite Aliases (in template/vite.config.js):**
- `@` → Project's `src/` directory
- `@layouts` → Project's `theme-layouts/` directory (falls back to `runtime/fallback-layouts/` if missing)
- `@gx-runtime` → Devtools's `runtime/` directory (from node_modules)

## App Manifest Configuration

The `app-manifest.json` file in the project root configures the plugin:

```json
{
  "settings": {
    "primary_color": "#FFD600",
    "background_color": "#ffffff",
    "custom_setting": "value"
  },
  "strings": {
    "default": {
      "welcome_title": "Welcome to My Plugin",
      "button_text": "Click Me"
    }
  },
  "assets": {
    "hero_image": "/dev-assets/images/hero.jpg",
    "logo": "/dev-assets/images/logo.png"
  },
  "triggerState": {
    "is_active": true,
    "current_step": 1
  },
  "dependencies": [],
  "permissions": []
}
```

The manifest is hot-reloaded during development - changes are reflected immediately without page refresh.

## GxP Strings Plugin

The devtools provides Vue directives for reactive string and asset replacement from the store.

### String Directives

```html
<!-- Replace text content with value from stringsList -->
<h1 gxp-string="welcome_title">Default Welcome</h1>

<!-- Replace text with value from pluginVars (settings) -->
<span gxp-string="company_name" gxp-settings>Default Company</span>

<!-- Replace text with value from assetList -->
<span gxp-string="logo_url" gxp-assets>/default/logo.png</span>

<!-- Replace text with value from triggerState -->
<span gxp-string="current_status" gxp-state>idle</span>
```

### Asset/Image Directives

```html
<!-- Replace src attribute with value from assetList (default) -->
<img gxp-src="hero_image" src="/dev-assets/placeholder.jpg" />

<!-- Replace src with value from triggerState -->
<img gxp-src="dynamic_image" gxp-state src="/dev-assets/placeholder.jpg" />
```

### How It Works
1. Elements store their original content as the default fallback
2. The plugin looks up the key in the appropriate store section
3. Content/attribute is replaced if a value exists
4. Falls back to original if no value found
5. Watches for store changes and updates reactively

## GxP Store (gxpPortalConfigStore.js)

The Pinia store provides reactive state management:

### Store Sections
- `pluginVars` - Plugin settings/configuration
- `stringsList` - Translatable strings
- `assetList` - Asset URLs
- `triggerState` - Dynamic state values
- `dependencyList` - External dependencies
- `permissionFlags` - Feature permissions

### Getter Methods
```javascript
const store = useGxpStore();
store.getString('welcome_title', 'Default');
store.getSetting('primary_color', '#000');
store.getAsset('hero_image', '/fallback.jpg');
store.getState('is_active', false);
store.hasPermission('admin');
```

### Update Methods (for programmatic updates)
```javascript
store.updateString('welcome_title', 'New Title');
store.updateSetting('primary_color', '#FF0000');
store.updateAsset('hero_image', '/new-image.jpg');
store.updateState('is_active', true);
store.addDevAsset('logo', 'logo.png'); // Adds with dev server URL prefix
```

### API Client
```javascript
await store.apiGet('/endpoint', { params });
await store.apiPost('/endpoint', data);
await store.apiPut('/endpoint', data);
await store.apiDelete('/endpoint');
```

### Socket Methods
```javascript
store.emitSocket('primary', 'event-name', data);
store.listenSocket('primary', 'event-name', callback);
store.useSocketListener('dependency-id', 'updated', callback);
```

## Dev Tools

### In-Browser Dev Tools (Ctrl+Shift+D)
- **Store Inspector** - View/edit store state with element highlighting
  - Hover over keys to highlight matching elements on the page
  - Double-click values to edit them in real-time
- **Layout Switcher** - Toggle between Public, Private, and System layouts
- **Socket Simulator** - Send test socket events
- **Mock Data Editor** - Edit theme colors, navigation, permissions

### Console API
```javascript
window.gxDevTools.open()       // Open dev tools
window.gxDevTools.close()      // Close dev tools
window.gxDevTools.toggle()     // Toggle dev tools
window.gxDevTools.store()      // Access the GxP store
window.gxDevTools.setLayout('private')  // Change layout
window.gxDevTools.getLayout()  // Get current layout name
```

## Browser Extensions

The browser extensions provide a DevTools panel for inspecting Vue components and GxP elements.

### Features
- **Element Selection** - Click to select elements on the page
- **Visual Highlighting** - Hover shows orange dashed border, selected shows cyan pulsing glow
- **Smart Labels** - Format: `ComponentName::element::gxp-string-key`
  - Example: `DemoPage::h1::welcome_title`
- **String Extraction** - Extract hardcoded strings to gxp-string attributes
- **Component Inspector** - View Vue component props and data

### Extension Launch
Extensions automatically open to the dev server URL when launched:
```bash
gxdev dev --chrome    # Launches Chrome to https://localhost:3060
gxdev dev --firefox   # Launches Firefox to https://localhost:3060
gxdev dev --no-https --chrome  # Launches to http://localhost:3060
```

### Reloading Extensions
After modifying extension code in `browser-extensions/`:
- Chrome: Go to `chrome://extensions`, click refresh on GxP Inspector
- Firefox: Go to `about:debugging`, reload the extension

## Interactive TUI

The `gxdev` command launches an interactive terminal UI:

### TUI Slash Commands
- `/dev` - Start Vite + Socket.IO servers
- `/dev --no-socket` - Start Vite only (no Socket.IO)
- `/dev --no-https` - Start without SSL
- `/dev --with-mock` - Start with Mock API enabled
- `/socket` - Start Socket.IO server
- `/ext chrome` - Launch Chrome extension
- `/ext firefox` - Launch Firefox extension
- `/stop <service>` - Stop a running service
- `/clear` - Clear current tab's logs
- `/quit` - Exit application

### Keyboard Shortcuts
- `Ctrl+1/2/3...` - Switch between service tabs
- `Ctrl+L` - Clear current log
- `Ctrl+K` - Stop current service
- `Ctrl+C` - Exit application
- `Shift+↑/↓` - Scroll log panel
- `Ctrl+↑/↓` - Jump to top/bottom of logs
- `Mouse wheel` - Scroll log panel
- `Tab` - Focus next element

## Environment Configuration

Key environment variables (set in `.env`):
- `NODE_PORT` - Development server port (default: 3060)
- `SOCKET_IO_PORT` - Socket.IO server port (default: 3069)
- `COMPONENT_PATH` - Main component path (default: `./src/Plugin.vue`)
- `USE_HTTPS` - Enable HTTPS (default: true)
- `CERT_PATH`, `KEY_PATH` - SSL certificate paths
- `USE_LOCAL_INDEX` - Use local `index.html` instead of the toolkit runtime version (default: unset/false)
- `USE_LOCAL_MAIN` - Use local `main.js` instead of the toolkit runtime version (default: unset/false)

## Key Dependencies
- Vue 3 with Composition API
- Pinia for state management
- Vite for building
- Socket.IO for real-time communication
- Ink (React-based TUI framework) for CLI interface
- `@gramercytech/gx-componentkit` - Component library for kiosk UI

## Building the Devtools

```bash
# Build the TUI (TypeScript → JavaScript)
npm run build:tui

# Watch mode for TUI development
npm run dev:tui

# Build browser extensions for distribution
npm run ext:build

# Full build
npm run build
```

## Customizing Runtime Files

If you need to customize files from the runtime directory:
```bash
gxdev publish server.js              # Copy server.js to project root
gxdev publish gxpPortalConfigStore.js  # Copy store to src/stores/
```
The CLI will automatically update imports when publishing.

## Testing Plugins

1. Run `npm run dev` or `gxdev dev` to start the development server
2. Use browser extensions (`gxdev dev --chrome` or `gxdev dev --firefox`) to inject and test plugins
3. Use `gxdev socket send --event <name>` to simulate real-time events
4. Edit `app-manifest.json` to test different configurations (hot-reloaded)
5. Use Dev Tools (Ctrl+Shift+D) to inspect and modify store state in real-time

## Troubleshooting

### Strings not updating from manifest
- Ensure `app-manifest.json` exists in project root
- Check that string keys match between manifest and gxp-string attributes
- The manifest is loaded asynchronously - first render may show defaults

### Browser extension not highlighting elements
- Reload the extension after code changes
- Ensure the inspector is injected (check console for `[GxP Inspector] Loaded`)
- The page must be the dev server URL for the inspector to work

### SSL certificate errors
- Run `npm run setup-ssl` to generate certificates with mkcert
- Accept the certificate in your browser when prompted

### Hot reload not working
- Check that Vite is running (look for `VITE ready` in logs)
- Ensure file is within the watched directories
- Try a full page refresh if HMR fails
