# GxP Dev Tools

A development toolkit for creating plugins for the GxP kiosk platform. Provides CLI tools, project scaffolding, an interactive TUI, and a development environment that emulates the GxP platform.

## Installation

### Global (Recommended)

```bash
npm install -g @gxp-dev/tools
```

### Project-Level

```bash
npm install --save-dev @gxp-dev/tools
```

### Updating

```bash
# Global
npm update -g @gxp-dev/tools

# Project-level
npm update @gxp-dev/tools
```

After updating, run `gxdev init` in existing projects to sync dependencies and config files.

## Quick Start

### New Project

```bash
gxdev init my-plugin
cd my-plugin
npm run dev-http
```

Your plugin is running at `http://localhost:3060`. Press `Ctrl+Shift+D` to open the in-browser Dev Tools.

### Existing Project

If you already have a Vue/Vite project:

```bash
cd my-existing-project
gxdev init
npm install
npm run dev-http
```

When run in a directory with an existing `package.json` (no name argument), `gxdev init` will:
- Add missing required dependencies and devDependencies
- Update mismatched dependency versions
- Add missing npm scripts (`dev`, `build`, `dev-http`, etc.)
- Back up your existing `vite.config.js` to `vite.config.js.backup`
- Copy config files (`app-manifest.json`, `.env.example`, store setup, AI agent configs)

It will **not** overwrite your source files (`src/`, `theme-layouts/`, etc.).

## CLI Commands

| Command | Description |
|---------|-------------|
| `gxdev` | Launch interactive TUI |
| `gxdev init [name]` | Create a new project or update an existing one |
| `gxdev dev` | Start development server (HTTPS + TUI) |
| `gxdev dev --no-https` | Start with HTTP only |
| `gxdev dev --with-socket` | Start with Socket.IO server |
| `gxdev dev --chrome` | Start and launch Chrome with extension |
| `gxdev dev --firefox` | Start and launch Firefox with extension |
| `gxdev build` | Build plugin for production |
| `gxdev setup-ssl` | Generate SSL certificates for HTTPS development |
| `gxdev publish <file>` | Copy runtime files to your project for customization |
| `gxdev datastore <action>` | Manage GxP datastore (list, add, scan-strings, config) |
| `gxdev socket <action>` | Simulate socket events (list, send) |
| `gxdev assets <action>` | Manage development assets (list, init, generate) |
| `gxdev add-dependency` | Add API dependency via interactive wizard |
| `gxdev extract-config` | Extract GxP config from source files |
| `gxdev ext:chrome` | Launch Chrome with browser extension |
| `gxdev ext:firefox` | Launch Firefox with browser extension |
| `gxdev ext:build` | Build browser extensions for distribution |

## Features

- **Platform Emulator** - PortalContainer.vue mimics the GxP platform environment
- **Interactive TUI** - Terminal UI for managing dev services, logs, and slash commands
- **Hot Module Replacement** - Instant updates during development
- **Socket.IO Integration** - Test real-time features with simulated events
- **SSL Support** - HTTPS development with auto-generated certificates
- **Browser Extensions** - Chrome/Firefox DevTools panel for inspecting plugins
- **Dev Tools Modal** - In-browser tools for inspecting state, switching layouts, and more (Ctrl+Shift+D)
- **AI Scaffolding** - Generate starter code with Claude, Codex, or Gemini during init
- **Mock API** - Local mock API server with OpenAPI spec integration
- **Asset Generation** - Create placeholder images for development

## Project Structure

After `gxdev init`, your project contains:

```
my-plugin/
├── src/
│   ├── Plugin.vue          # Main plugin entry point
│   ├── DemoPage.vue        # Example component
│   └── stores/
│       └── index.js        # Pinia store setup
├── theme-layouts/          # Layout components (Public, Private, System)
├── dev-assets/images/      # Development placeholder images
├── socket-events/          # Socket event templates
├── app-manifest.json       # Plugin configuration (strings, settings, assets)
├── .env                    # Environment variables
└── package.json
```

The dev server automatically serves `index.html` and `main.js` from the toolkit runtime — no local copies needed.

## Environment Variables

Key variables (set in `.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_PORT` | `3060` | Development server port |
| `SOCKET_IO_PORT` | `3061` | Socket.IO server port |
| `COMPONENT_PATH` | `./src/Plugin.vue` | Main component path |
| `USE_HTTPS` | `true` | Enable HTTPS |
| `CERT_PATH` | | SSL certificate path |
| `KEY_PATH` | | SSL private key path |
| `USE_LOCAL_INDEX` | | Set to `true` to use a local `index.html` instead of the runtime version |
| `USE_LOCAL_MAIN` | | Set to `true` to use a local `main.js` instead of the runtime version |
| `SOCKET_IO_ENABLED` | `false` | Auto-start Socket.IO |
| `API_ENV` | `mock` | API environment (mock, local, development, staging, production) |

## Runtime vs Template

- **Runtime files** stay in `node_modules/` and are served automatically (`index.html`, `main.js`, store, dev tools, Vite config). Override `index.html`/`main.js` with `USE_LOCAL_INDEX`/`USE_LOCAL_MAIN` env vars. Use `gxdev publish` to copy other runtime files locally for customization.
- **Template files** are copied to your project during `gxdev init` and are fully yours to edit.

## Documentation

Full documentation is available at the [GxP Documentation site](https://docs.gramercytech.com/gx-devtools).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, architecture details, and how to make changes to the toolkit itself.

## License

ISC
