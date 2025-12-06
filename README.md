# GxP Dev Toolkit

A development toolkit for creating plugins for the GxP kiosk platform. This package provides CLI tools, project scaffolding, and a development environment that emulates the GxP platform.

## Installation

```bash
npm install -g @gramercytech/gx-toolkit
```

Or use it as a dev dependency in your project:

```bash
npm install --save-dev @gramercytech/gx-toolkit
```

## Quick Start

Create a new GxP plugin project:

```bash
gxtk init my-plugin
cd my-plugin
npm run dev
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `gxtk init [name]` | Create a new project or update an existing one |
| `gxtk dev` | Start development server with HTTPS and Socket.IO |
| `gxtk dev --no-https` | Start development server with HTTP only |
| `gxtk build` | Build plugin for production |
| `gxtk setup-ssl` | Generate SSL certificates for HTTPS development |
| `gxtk publish <file>` | Copy runtime files to your project for customization |
| `gxtk datastore <action>` | Manage GxP datastore (list, add, scan-strings, config) |
| `gxtk socket <action>` | Simulate socket events (list, send) |
| `gxtk assets <action>` | Manage development assets (list, init, generate) |
| `gxtk ext:firefox` | Launch Firefox with browser extension |
| `gxtk ext:chrome` | Launch Chrome with browser extension |
| `gxtk ext:build` | Build browser extensions for distribution |

## Features

- **Platform Emulator**: PortalContainer.vue mimics the GxP platform environment
- **Hot Module Replacement**: Instant updates during development
- **Socket.IO Integration**: Test real-time features with simulated events
- **SSL Support**: HTTPS development with auto-generated certificates
- **Browser Extensions**: Test plugins on live GxP pages
- **Dev Tools Modal**: In-browser tools for inspecting state, switching layouts, and more
- **Asset Generation**: Create placeholder images for development

---

# Toolkit Development Guide

This section is for developers contributing to the toolkit itself.

## Repository Structure

```
gx-toolkit/
├── bin/                    # CLI tool
│   ├── gx-toolkit.js       # Entry point (delegates to lib/cli.js)
│   └── lib/                # Modular CLI components
│       ├── cli.js          # Yargs command definitions
│       ├── constants.js    # Dependencies, scripts, ports
│       ├── commands/       # Individual command modules
│       │   ├── init.js     # gxtk init
│       │   ├── dev.js      # gxtk dev
│       │   ├── build.js    # gxtk build
│       │   ├── publish.js  # gxtk publish
│       │   ├── ssl.js      # gxtk setup-ssl
│       │   ├── datastore.js
│       │   ├── socket.js
│       │   ├── assets.js
│       │   └── extensions.js
│       └── utils/          # Shared utilities
│           ├── paths.js    # Path resolution
│           ├── ssl.js      # SSL certificate management
│           ├── files.js    # File operations
│           └── prompts.js  # User prompts
├── runtime/                # Files used from node_modules (NOT copied to projects)
│   ├── PortalContainer.vue # Platform emulator (immutable for users)
│   ├── server.js           # Socket.IO development server
│   ├── dev-tools/          # In-browser development tools
│   │   ├── DevToolsModal.vue
│   │   ├── StoreInspector.vue
│   │   ├── LayoutSwitcher.vue
│   │   ├── SocketSimulator.vue
│   │   └── MockDataEditor.vue
│   └── stores/
│       └── gxpPortalConfigStore.js  # Core Pinia store
├── template/               # Files copied to new projects during init
│   ├── src/
│   │   ├── Plugin.vue      # User's app entry point
│   │   ├── DemoPage.vue    # Example component
│   │   └── stores/         # Store setup
│   ├── theme-layouts/      # Layout templates
│   ├── dev-assets/         # Placeholder images
│   ├── main.js             # Dev entry point
│   ├── vite.config.js      # Project build config
│   └── ...
├── socket-events/          # Socket event templates for simulation
├── browser-extensions/     # Chrome and Firefox extensions
│   ├── chrome/
│   └── firefox/
└── scripts/                # Build and launch scripts
```

## Key Concepts

### Runtime vs Template

- **`/runtime/`**: Files that stay in node_modules and are imported at runtime via the `@gx-runtime` Vite alias. Users cannot modify these files directly.

- **`/template/`**: Files copied to user projects during `gxtk init`. Users can edit these files.

### Vite Aliases

Projects use these aliases (defined in `template/vite.config.js`):

- `@` → Project's `src/` directory
- `@layouts` → Project's `theme-layouts/` directory
- `@gx-runtime` → Toolkit's `runtime/` directory (from node_modules)

### PortalContainer.vue

The platform emulator that wraps user plugins during development. It:
- Provides mock router, theme, and navigation
- Injects props that the real platform provides
- Includes the dev tools modal (Ctrl+Shift+D)
- Lives in `/runtime/` so users can't accidentally modify it

## Setting Up for Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/GramercyTech/gx-toolkit.git
   cd gx-toolkit
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Link for local testing**:
   ```bash
   npm link
   ```

4. **Create a test project**:
   ```bash
   mkdir /tmp/test-project
   cd /tmp/test-project
   gxtk init test-app
   cd test-app

   # Link to local toolkit instead of npm version
   rm -rf node_modules/@gramercytech/gx-toolkit
   mkdir -p node_modules/@gramercytech
   ln -s /path/to/gx-toolkit node_modules/@gramercytech/gx-toolkit

   npm run dev-http
   ```

## Making Changes

### Adding a New CLI Command

1. Create a new file in `bin/lib/commands/`:
   ```javascript
   // bin/lib/commands/mycommand.js
   function myCommand(argv) {
       console.log("My command running!");
   }
   module.exports = { myCommand };
   ```

2. Export from `bin/lib/commands/index.js`

3. Register in `bin/lib/cli.js`:
   ```javascript
   .command('mycommand', 'Description', {}, myCommand)
   ```

### Modifying the Dev Tools Modal

Dev tools components are in `/runtime/dev-tools/`. Changes here affect all projects using the toolkit.

### Adding Template Files

Add files to `/template/` and update `bin/lib/commands/init.js` to copy them during project creation.

## Testing

### Manual Testing

```bash
# Test CLI help
node bin/gx-toolkit.js --help

# Test init command
cd /tmp && rm -rf test-project
node /path/to/gx-toolkit/bin/gx-toolkit.js init test-project

# Test dev server (after linking)
cd test-project
npm run dev-http

# Test build
npm run build
```

### Verifying Changes

1. Create a fresh test project
2. Link the local toolkit
3. Run `npm run dev-http` and verify the app loads
4. Run `npm run build` and check `dist/` output
5. Test dev tools with Ctrl+Shift+D

## Publishing

1. Update version in `package.json`
2. Ensure all new directories are included (runtime/, template/, socket-events/)
3. Run `npm publish`

## Dependencies

The toolkit uses:
- **Vite** - Build tool and dev server
- **Vue 3** - UI framework
- **Pinia** - State management
- **Socket.IO** - Real-time communication
- **yargs** - CLI argument parsing
- **shelljs** - Shell commands
- **mkcert** - SSL certificate generation

## License

ISC
