# Contributing to GxP Dev Tools

This guide is for developers contributing to the devtools package itself.

## Repository Structure

```
gx-devtools/
├── bin/                    # CLI tool
│   ├── gx-devtools.js       # Entry point (delegates to lib/cli.js)
│   └── lib/                # Modular CLI components
│       ├── cli.js          # Yargs command definitions
│       ├── constants.js    # Dependencies, scripts, ports
│       ├── commands/       # Individual command modules
│       │   ├── init.js     # gxdev init
│       │   ├── dev.js      # gxdev dev
│       │   ├── build.js    # gxdev build
│       │   ├── publish.js  # gxdev publish
│       │   ├── ssl.js      # gxdev setup-ssl
│       │   ├── datastore.js
│       │   ├── socket.js
│       │   ├── assets.js
│       │   └── extensions.js
│       ├── utils/          # Shared utilities
│       │   ├── paths.js    # Path resolution
│       │   ├── ssl.js      # SSL certificate management
│       │   ├── files.js    # File operations
│       │   └── prompts.js  # User prompts
│       └── tui/            # Interactive Terminal UI (TypeScript/Ink)
│           ├── index.tsx   # TUI entry point
│           ├── App.tsx     # Main Ink application
│           ├── components/ # UI components
│           ├── services/   # Service managers (Vite, Socket, Extensions)
│           └── commands/   # TUI slash command handlers
├── runtime/                # Files used from node_modules (NOT copied to projects)
│   ├── PortalContainer.vue # Platform emulator (immutable for users)
│   ├── index.html          # Dev HTML template (served by Vite middleware)
│   ├── main.js             # Dev entry point (served by Vite middleware)
│   ├── vite.config.js      # Vite configuration
│   ├── server.js           # Socket.IO development server
│   ├── gxpStringsPlugin.js # Vue plugin for gxp-string/gxp-src directives
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
│   └── ...
├── socket-events/          # Socket event templates for simulation
├── browser-extensions/     # Chrome and Firefox extensions
│   ├── chrome/
│   └── firefox/
├── scripts/                # Build and launch scripts
└── dist/                   # Compiled TUI output
```

## Key Concepts

### Runtime vs Template

- **`/runtime/`**: Files that stay in node_modules and are imported at runtime via the `@gx-runtime` Vite alias. Users cannot modify these files directly. The `index.html` and `main.js` in runtime are served by a Vite middleware plugin — they are not copied to user projects. Users can opt in to local overrides via `USE_LOCAL_INDEX` and `USE_LOCAL_MAIN` env vars.

- **`/template/`**: Files copied to user projects during `gxdev init`. For new projects, all template files are copied. For existing projects (those with a `package.json` already), only bundle/config files are copied (manifest, store setup, AI agent configs) — source files like `Plugin.vue` and layouts are skipped.

### Vite Aliases

Projects use these aliases (defined in `runtime/vite.config.js`):

- `@` → Project's `src/` directory
- `@layouts` → Project's `theme-layouts/` directory
- `@gx-runtime` → DevTools's `runtime/` directory (from node_modules)

### PortalContainer.vue

The platform emulator that wraps user plugins during development. It:
- Provides mock router, theme, and navigation
- Injects props that the real platform provides
- Includes the dev tools modal (Ctrl+Shift+D)
- Lives in `/runtime/` so users can't accidentally modify it

## Setting Up for Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/GramercyTech/gx-devtools.git
   cd gx-devtools
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the TUI** (required for the CLI to work):
   ```bash
   npm run build:tui
   ```

4. **Link for local testing**:
   ```bash
   npm link
   ```

5. **Create a test project**:
   ```bash
   mkdir /tmp/test-project
   cd /tmp/test-project
   gxdev init test-app
   cd test-app
   npm run dev-http
   ```

## Building

```bash
# Build the TUI (TypeScript → JavaScript)
npm run build:tui

# Watch mode for TUI development
npm run dev:tui

# Build browser extensions for distribution
npm run ext:build
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

Dev tools components are in `/runtime/dev-tools/`. Changes here affect all projects using the devtools.

### Adding Template Files

Add files to `/template/` and update `bin/lib/commands/init.js` to copy them during project creation.

## Testing

### Manual Testing

```bash
# Test CLI help
node bin/gx-devtools.js --help

# Test init command
cd /tmp && rm -rf test-project
node /path/to/gx-devtools/bin/gx-devtools.js init test-project

# Test dev server (after linking)
cd test-project
npm run dev-http

# Test build
npm run build
```

### Verifying Changes

1. Create a fresh test project
2. Run `npm run dev-http` and verify the app loads
3. Run `npm run build` and check `dist/` output
4. Test dev tools with Ctrl+Shift+D

## Publishing

1. Update version in `package.json`
2. Ensure all new directories are included (runtime/, template/, socket-events/)
3. Run `npm publish`

## Dependencies

The devtools uses:
- **Vite** - Build tool and dev server
- **Vue 3** - UI framework
- **Pinia** - State management
- **Socket.IO** - Real-time communication
- **Ink** - React-based TUI framework
- **yargs** - CLI argument parsing
- **shelljs** - Shell commands
- **mkcert** - SSL certificate generation
