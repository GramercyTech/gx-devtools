---
sidebar_position: 7
title: CLI Reference
description: Complete reference for all gxdev CLI commands and options
---

# CLI Reference

Complete reference for the `gxdev` command-line interface.

## Installation

```bash
# Global installation (recommended)
pnpm install -g @gxp-dev/tools

# Project-level installation
pnpm install --save-dev @gxp-dev/tools
```

## Quick Reference

| Command | Description |
|---------|-------------|
| `gxdev` | Launch interactive TUI |
| `gxdev init [name]` | Create or update a project |
| `gxdev dev` | Start development server |
| `gxdev build` | Build for production |
| `gxdev datastore <action>` | Manage store data |
| `gxdev socket <action>` | Socket event simulation |
| `gxdev assets <action>` | Asset management |
| `gxdev ext:chrome` | Launch Chrome with extension |
| `gxdev ext:firefox` | Launch Firefox with extension |
| `gxdev ext:build` | Build extensions for distribution |
| `gxdev ext:install <browser>` | Permanent extension install guide |
| `gxdev setup-ssl` | Generate SSL certificates |
| `gxdev publish <file>` | Copy runtime files to project |
| `gxdev add-dependency` | Add API dependency via wizard |
| `gxdev extract-config` | Extract GxP config from source |

---

## gxdev init

Initialize a new GxP project with an interactive configuration wizard.

```bash
gxdev init [name] [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `name` | Project name (optional - will prompt if not provided) |

### Options

| Option | Alias | Description |
|--------|-------|-------------|
| `--description` | `-d` | Project description (skips interactive prompt) |
| `--build` | `-b` | AI build prompt for auto-scaffolding (skips interactive mode) |
| `--provider` | `-p` | AI provider: `claude`, `codex`, or `gemini` (default: gemini) |

### Interactive Flow

After providing a project name, the init command runs an interactive configuration wizard:

#### Step 1: App Name
```
──────────────────────────────────────────────────
📝 Configure Your Plugin
──────────────────────────────────────────────────

? App name
❯ my-plugin - From package.json
  Enter custom name
```

Use arrow keys to:
- Select the prepopulated name (from package.json)
- Or select "Enter custom name" and type a new value

#### Step 2: Description
```
? Description
❯ A GxP kiosk plugin - From package.json
  Enter custom description
```

#### Step 3: AI Scaffolding
```
──────────────────────────────────────────────────
🤖 AI-Powered Scaffolding
──────────────────────────────────────────────────
   Describe what you want to build and AI will generate
   starter components, views, and manifest configuration.

? Choose AI provider for scaffolding
❯ Skip AI scaffolding
  Claude - logged in
  Codex - logged in
  Gemini - via API key
```

The wizard auto-detects available AI providers. If you select one:
```
📝 Describe your plugin (what it does, key features, UI elements):
  (Press Enter twice when done)

  > A check-in kiosk for conference attendees
  > Should have a welcome screen, badge scanner input
  > Success/error confirmation screens
  >
```

#### Step 4: SSL Configuration
```
──────────────────────────────────────────────────
🔒 SSL Configuration
──────────────────────────────────────────────────

? Set up SSL certificates for HTTPS development?
❯ Yes, set up SSL - Recommended for full feature access
  Skip SSL setup - Can be set up later with pnpm run setup-ssl
```

#### Step 5: Start Development
```
──────────────────────────────────────────────────
🚀 Start Development
──────────────────────────────────────────────────

? How would you like to start the development server?
❯ Start app - HTTPS dev server
  Start app with Mock API - Dev server + Socket.IO + Mock API
  Skip
```

#### Step 6: Browser Extension (if starting app)
```
? Launch browser with GxP extension?
❯ Chrome - Launch Chrome with DevTools panel
  Firefox - Launch Firefox with DevTools panel
  Skip
```

### AI Scaffolding

When you provide a build description, the AI will generate:
- Vue component files in `src/`
- Updates to `app-manifest.json` with strings and assets
- A brief explanation of what was created

#### Supported AI Providers

| Provider | Authentication | Setup |
|----------|----------------|-------|
| **Claude** | CLI login | `pnpm i -g @anthropic-ai/claude-code && claude login` |
| **Codex** | CLI login | `pnpm i -g @openai/codex && codex auth` |
| **Gemini** | CLI login | `pnpm i -g @google/gemini-cli && gemini` |
| **Gemini** | API key | `export GEMINI_API_KEY=your_key` |
| **Gemini** | gcloud | `gcloud auth login` |

The init wizard auto-detects which providers are available and shows only those options. You can also specify a provider directly:

```bash
# Use Claude
gxdev init my-plugin -b "Build description" -p claude

# Use Codex
gxdev init my-plugin -b "Build description" -p codex

# Use Gemini (default)
gxdev init my-plugin -b "Build description" -p gemini
```

### Behavior

**New Project:**
1. Prompts for project name (if not provided)
2. Creates project directory
3. Generates `package.json` with required dependencies
4. Copies template files (Plugin.vue, layouts, manifest, etc.)
5. Runs `pnpm install`
6. Enters interactive configuration wizard:
   - App name (prepopulated from package.json)
   - Description (prepopulated from package.json)
   - AI scaffolding (optional)
   - SSL setup (optional)
   - Start development (optional)
   - Browser extension (optional)

**Existing Project (has package.json):**
1. Updates dependencies to latest versions
2. Copies any missing template files (won't overwrite existing)
3. Updates package scripts

**Non-Interactive Mode (with --build flag):**
Skips the interactive wizard and directly runs AI scaffolding

### Files Created

```
my-plugin/
├── src/
│   ├── Plugin.vue           # Your main plugin entry point
│   ├── DemoPage.vue         # Example component
│   ├── assets/              # User assets directory
│   └── stores/
│       └── index.js         # Pinia store setup
├── theme-layouts/
│   ├── PublicLayout.vue     # Public-facing layout
│   ├── PrivateLayout.vue    # Authenticated layout
│   ├── SystemLayout.vue     # Admin layout
│   └── AdditionalStyling.css
├── .claude/
│   ├── agents/
│   │   └── gxp-developer.md # Claude Code subagent
│   └── settings.json        # MCP server configuration
├── socket-events/           # Socket event templates
├── scripts/
│   └── launch-chrome.js     # Chrome launcher
├── app-manifest.json        # Plugin configuration
├── configuration.json       # Additional configuration
├── app-instructions.md      # Plugin instructions
├── default-styling.css      # Default CSS styles
├── AGENTS.md                # Codex/AI agent instructions
├── GEMINI.md                # Gemini Code Assist instructions
├── .env                     # Environment variables
├── .env.example             # Environment template
├── .gitignore
└── README.md
```

### Examples

```bash
# Create new project interactively (recommended)
gxdev init

# Create new project with name
gxdev init my-awesome-plugin

# Create with name and description
gxdev init my-plugin -d "Event check-in kiosk for conferences"

# Create with AI scaffolding (non-interactive)
gxdev init checkin-kiosk -d "Conference check-in" -b "A kiosk with welcome screen, badge scanner, and confirmation"

# Update existing project
cd existing-project
gxdev init
```

---

## gxdev dev

Start the development server with hot reload.

```bash
gxdev dev [options]
```

### Options

| Option | Alias | Default | Description |
|--------|-------|---------|-------------|
| `--port` | | `3060` | Development server port |
| `--no-https` | | `false` | Disable HTTPS, use HTTP |
| `--with-socket` | `-s` | `false` | Start Socket.IO server |
| `--with-mock` | `-m` | `false` | Enable Mock API server (requires socket) |
| `--chrome` | | `false` | Launch Chrome with extension |
| `--firefox` | | `false` | Launch Firefox with extension |
| `--component-path` | | `./src/Plugin.vue` | Path to main component |
| `--node-log-level` | | `info` | Node log level |

### Examples

```bash
# Start with HTTPS (default)
gxdev dev

# Start without HTTPS (simpler setup)
gxdev dev --no-https

# Start with Socket.IO server
gxdev dev --with-socket

# Start with Mock API server
gxdev dev --with-socket --with-mock

# Start and launch Chrome with extension
gxdev dev --chrome

# Start and launch Firefox with extension
gxdev dev --firefox

# Combine options
gxdev dev --no-https --with-socket --chrome
```

### Package Scripts

After `gxdev init`, these scripts are available:

```bash
pnpm run dev          # gxdev dev --with-socket
pnpm run dev-app      # gxdev dev
pnpm run dev-http     # gxdev dev --no-https
```

---

## gxdev build

Build the plugin for production deployment.

```bash
gxdev build [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--component-path` | `./src/Plugin.vue` | Path to main component |
| `--node-log-level` | `error` | Node log level |

### Build Output

The build process creates:

```
dist/
├── build/
│   ├── plugin.es.js        # Main plugin bundle (ES module)
│   ├── plugin.es.css       # Extracted styles
│   ├── app-manifest.json   # Cleaned manifest
│   ├── assets/             # Copied from src/assets/
│   ├── appInstructions.md  # Optional instructions
│   ├── default-styling.css # Optional styling
│   └── configuration.json  # Optional config
└── my-plugin.gxpapp        # Packaged plugin (ZIP)
```

### Build Process

1. **Vite Build** - Compiles Vue SFCs, bundles dependencies, extracts CSS
2. **Asset Copy** - Copies assets from `src/assets/` to `dist/build/assets/`
3. **Manifest Processing** - Cleans and copies `app-manifest.json`
4. **Optional Files** - Processes appInstructions, defaultStyling, configuration
5. **Package Creation** - Creates `.gxpapp` ZIP file with all build artifacts

### Package Contents (.gxpapp)

The `.gxpapp` file is a ZIP archive containing:
- `plugin.es.js` - Main plugin code
- `plugin.es.css` - Plugin styles
- `app-manifest.json` - Plugin configuration
- `assets/` - Static assets
- `appInstructions.md` (optional)
- `default-styling.css` (optional)
- `configuration.json` (optional)

### Examples

```bash
# Standard build
gxdev build

# Build with custom component path
gxdev build --component-path ./src/CustomPlugin.vue
```

---

## gxdev datastore

Manage GxP datastore test data and configuration.

```bash
gxdev datastore <action> [options]
```

### Actions

| Action | Description |
|--------|-------------|
| `list` | List all store variables |
| `add` | Add a new variable |
| `scan-strings` | Scan components for hardcoded strings |
| `config` | Switch between test configurations |
| `init` | Add datastore to existing project |

### datastore list

Display all variables in the store:

```bash
gxdev datastore list
```

Output shows:
- 🔧 Plugin Variables (pluginVars)
- 📝 Strings (stringsList)
- 🖼️ Assets (assetList)
- 🔗 Dependencies (dependencyList)

### datastore add

Add a new variable to the store:

```bash
# Interactive mode
gxdev datastore add

# Direct mode
gxdev datastore add --type string --key welcome_title --value "Hello World"
gxdev datastore add --type setting --key max_items --value 10
gxdev datastore add --type asset --key logo --value "/dev-assets/images/logo.png"
```

Options:

| Option | Description |
|--------|-------------|
| `--type` | Variable type: `string`, `setting`, or `asset` |
| `--key` | Variable key/name |
| `--value` | Variable value |

### datastore scan-strings

Scan Vue components for hardcoded strings that should be extracted:

```bash
# Scan a specific component
gxdev datastore scan-strings --component src/Plugin.vue

# Interactive mode
gxdev datastore scan-strings
```

The scanner:
1. Parses the `<template>` section
2. Finds text content within HTML elements
3. Suggests key names based on the text
4. Prompts to add each string to the store

### datastore config

Switch between named test data configurations:

```bash
# List available configurations
gxdev datastore config

# Switch to a specific configuration
gxdev datastore config --config production
```

Create configurations by copying `test-data.json`:
```bash
cp src/stores/test-data.json src/stores/test-data-production.json
```

### datastore init

Add GxP datastore to an existing Vue project:

```bash
gxdev datastore init
```

This will:
1. Add Pinia and Axios dependencies
2. Create store files in `src/stores/`
3. Add datastore scripts to `package.json`
4. Update `main.js` to include Pinia

---

## gxdev socket

Simulate Socket.IO events for development testing.

```bash
gxdev socket <action> [options]
```

### Actions

| Action | Description |
|--------|-------------|
| `list` | List available socket events |
| `send` | Send a socket event |

### socket list

Display all available socket event templates:

```bash
gxdev socket list
```

Shows for each event:
- Event name
- Channel
- Data ID (if applicable)

### socket send

Send a socket event to the running Socket.IO server:

```bash
gxdev socket send --event <EventName> [--identifier <id>]
```

Options:

| Option | Description |
|--------|-------------|
| `--event` | Event name (matches JSON file in socket-events/) |
| `--identifier` | Override the channel identifier |

Examples:

```bash
# Send an event
gxdev socket send --event AiSessionMessageCreated

# Send with custom identifier
gxdev socket send --event SocialStreamPostCreated --identifier my_stream_id
```

### Socket Event Files

Events are defined in JSON files in the `socket-events/` directory:

```json
{
  "event": "EventName",
  "channel": "private.Model.identifier",
  "data": {
    "id": 123,
    "message": "Event payload"
  }
}
```

---

## gxdev assets

Manage development assets and placeholder image generation.

```bash
gxdev assets <action> [options]
```

### Actions

| Action | Description |
|--------|-------------|
| `list` | List development assets |
| `generate` | Generate placeholder images |
| `init` | Initialize asset directories |

### assets list

Display all files in `dev-assets/`:

```bash
gxdev assets list
```

Shows file name, size, and development URL for each asset.

### assets generate

Generate placeholder images using ImageMagick:

```bash
gxdev assets generate [options]
```

Options:

| Option | Default | Description |
|--------|---------|-------------|
| `--size` | `400x300` | Image dimensions (WxH) |
| `--name` | `placeholder` | Base filename |
| `--format` | `png` | Image format: png, jpg, jpeg, gif |
| `--color` | random | Background color (hex) |
| `--text` | auto | Text overlay |
| `--count` | `1` | Number of variants to generate |

Examples:

```bash
# Generate a single placeholder
gxdev assets generate

# Generate with specific size and name
gxdev assets generate --size 800x600 --name hero

# Generate multiple variants
gxdev assets generate --name banner --count 5

# Generate with specific color
gxdev assets generate --color "#FF6B6B" --name error-bg
```

**Note:** Requires ImageMagick to be installed on your system.

### assets init

Set up the development assets directory structure:

```bash
gxdev assets init
```

Creates:
```
dev-assets/
├── images/    # Image placeholders
└── videos/    # Video placeholders
```

Also copies any starter assets from the toolkit and adds `dev-assets/` to `.gitignore`.

---

## gxdev ext:chrome

Launch Google Chrome with the GxP Inspector extension loaded.

```bash
gxdev ext:chrome
```

### Behavior

1. Looks for extension in `browser-extensions/chrome/` (project or toolkit)
2. Launches Chrome with the extension auto-loaded
3. Opens to the development server URL

### Requirements

- Google Chrome installed
- Extension directory exists

---

## gxdev ext:firefox

Launch Firefox with the GxP Inspector extension loaded.

```bash
gxdev ext:firefox
```

### Behavior

1. Looks for extension in `browser-extensions/firefox/` (project or toolkit)
2. Uses `web-ext` to launch Firefox with temporary extension
3. Opens to the development server URL

### Requirements

- Firefox installed
- `web-ext` npm package (installed automatically)

---

## gxdev ext:build

Build browser extensions for distribution.

```bash
gxdev ext:build
```

### Output

```
dist/
├── firefox/    # Firefox extension package (.xpi)
└── chrome/     # Chrome extension package (.crx)
```

### What It Does

1. **Firefox** - Uses `web-ext build` to create signed extension package
2. **Chrome** - Uses packaging script to create Chrome extension

---

## gxdev ext:install

Get instructions for permanently installing extensions in your browser.

```bash
gxdev ext:install <browser>
```

### Arguments

| Argument | Description |
|----------|-------------|
| `browser` | Browser to install: `chrome` or `firefox` |

### Chrome Installation

```bash
gxdev ext:install chrome
```

Instructions provided:
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the extension directory

### Firefox Installation

```bash
gxdev ext:install firefox
```

Two options provided:
1. **Temporary Add-on** - Easy but removed on restart
2. **Persistent Installation** - Requires Firefox Developer Edition

---

## gxdev setup-ssl

Generate SSL certificates for HTTPS development using mkcert.

```bash
gxdev setup-ssl
```

### What It Does

1. Checks for mkcert installation
2. Installs local CA if needed
3. Generates certificates for `localhost`
4. Updates `.env` with certificate paths

### Requirements

- [mkcert](https://github.com/FiloSottile/mkcert) must be installed

### Certificate Location

Certificates are generated in the project root:
- `localhost.pem` - Certificate
- `localhost-key.pem` - Private key

---

## gxdev publish

Copy runtime files from the toolkit to your project for customization.

```bash
gxdev publish <file>
```

### Available Files

| File | Destination | Description |
|------|-------------|-------------|
| `server.js` | `./server.js` | Socket.IO server |
| `gxpPortalConfigStore.js` | `./src/stores/` | GxP Pinia store |
| `main.js` | `./main.js` | Development entry point |
| `vite.config.js` | `./vite.config.js` | Vite configuration |
| `index.html` | `./index.html` | Development HTML |

### When to Use

Use `publish` when you need to customize files that normally come from the toolkit's `runtime/` directory. Once published, the local copy takes precedence.

### Examples

```bash
# Customize the Socket.IO server
gxdev publish server.js

# Customize the Pinia store
gxdev publish gxpPortalConfigStore.js

# Customize Vite configuration
gxdev publish vite.config.js
```

---

## Environment Variables

Key environment variables recognized by gxdev:

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_PORT` | `3060` | Development server port |
| `SOCKET_IO_PORT` | `3069` | Socket.IO server port |
| `USE_HTTPS` | `true` | Enable HTTPS |
| `CERT_PATH` | | SSL certificate path |
| `KEY_PATH` | | SSL private key path |
| `COMPONENT_PATH` | `./src/Plugin.vue` | Main component path |
| `SOCKET_IO_ENABLED` | `false` | Auto-start Socket.IO |
| `VITE_API_ENV` | `mock` | API environment: mock, local, develop, staging, production |
| `VITE_API_KEY` | | API authentication key |
| `VITE_API_PROJECT_ID` | | Project ID for API calls |

### API Environments

| Environment | API Base URL |
|-------------|--------------|
| `mock` | `https://localhost:3060/mock-api` |
| `local` | `https://dashboard.eventfinity.test` |
| `develop` | `https://api.zenith-develop.env.eventfinity.app` |
| `staging` | `https://api.efz-staging.env.eventfinity.app` |
| `production` | `https://api.gramercy.cloud` |

---

## Global Configuration

Create a `.gxdevrc.json` file in your home directory for global defaults:

```json
{
  "defaultPort": 3060,
  "preferHttps": true,
  "autoStartSocket": false
}
```

Project-level `.gxdevrc.json` overrides global settings.

---

## gxdev add-dependency

Interactive wizard for adding API dependencies to your `app-manifest.json`.

```bash
gxdev add-dependency [options]
```

### Options

| Option | Alias | Default | Description |
|--------|-------|---------|-------------|
| `--env` | `-e` | `develop` | API environment: `develop` or `local` |

### What It Does

The wizard:
1. Loads OpenAPI and AsyncAPI specifications from the selected environment
2. Groups API endpoints by tags/models
3. Displays a type-ahead selection for choosing a model
4. Shows available endpoints with multi-select
5. Shows available socket events with multi-select
6. Prompts for a dependency identifier
7. Generates and saves the dependency configuration

### Interactive Flow

```
╔════════════════════════════════════════════╗
║       Add API Dependency Wizard            ║
╚════════════════════════════════════════════╝

Environment: develop
Loading API specifications...

✓ Loaded OpenAPI spec (156 paths)
✓ Loaded AsyncAPI spec (23 events)

Select a model/tag (type to filter):
  → AccessPoint (5 paths, 2 events)
    Attendee (12 paths, 4 events)
    Badge (8 paths, 1 event)
    ...

Select API endpoints:
  [x] GET /v1/projects/.../access-points
  [x] GET /v1/projects/.../access-points/{access_point}
  [ ] POST /v1/projects/.../access-points
  [ ] PUT /v1/projects/.../access-points/{access_point}
  ...

Select socket events:
  [x] AccessPointUpdated
  [x] AccessPointDeleted

Enter dependency identifier: access_points

─────────────────────────────────────────────
Generated Dependency Configuration:
─────────────────────────────────────────────
{
  "identifier": "access_points",
  "model": "AccessPoint",
  "permissionKey": "access_point",
  "permissions": ["view_access_points"],
  "operations": {
    "access-points.index": "get:/v1/projects/{teamSlug}/{projectSlug}/access-points",
    "access-points.show": "get:/v1/projects/{teamSlug}/{projectSlug}/access-points/{access_point}"
  },
  "events": {
    "AccessPointUpdated": "AccessPointUpdated",
    "AccessPointDeleted": "AccessPointDeleted"
  }
}

✓ Added dependency to app-manifest.json
```

### Generated Dependency Structure

| Field | Description |
|-------|-------------|
| `identifier` | Unique ID used when calling `store.callApi()` |
| `model` | The API model/resource name |
| `permissionKey` | Permission key for access control |
| `permissions` | Required permissions extracted from API spec |
| `operations` | Map of operationId → `method:path` |
| `events` | Map of socket events for this resource |

### Using the Dependency

Once added, call any operation using `gxpStore.callApi()`:

```javascript
const store = useGxpStore();

// Use the operationId and identifier
const items = await store.callApi('access-points.index', 'access_points');

const item = await store.callApi('access-points.show', 'access_points', {
  access_point: 123
});
```

### Examples

```bash
# Use default environment (develop)
gxdev add-dependency

# Use local API
gxdev add-dependency --env local
gxdev add-dependency -e local
```

### TUI Usage

The command is also available in the interactive TUI:

```
/add-dependency
/add-dependency --env local
```

**Note:** Running from TUI will exit and launch the wizard in a separate terminal session (required for interactive prompts).

---

## gxdev extract-config

Scan source files and extract GxP configuration to `app-manifest.json`.

```bash
gxdev extract-config [options]
```

### Options

| Option | Alias | Description |
|--------|-------|-------------|
| `--dry-run` | `-d` | Preview changes without modifying files |
| `--overwrite` | `-o` | Overwrite existing values in manifest |

### What It Extracts

- `gxp-string` attributes → `strings` section
- `gxp-src` attributes → `assets` section
- `gxp-settings` attributes → `settings` section
- `gxp-state` attributes → `triggerState` section
- `store.getString()` calls → `strings` section
- `store.getAsset()` calls → `assets` section

### Examples

```bash
# Preview what would be extracted
gxdev extract-config --dry-run

# Extract and merge with existing manifest
gxdev extract-config

# Extract and overwrite existing values
gxdev extract-config --overwrite
```

### TUI Usage

```
/extract-config
/extract-config --dry-run
/extract-config --overwrite
```
