# GxP Dev Tools

A development toolkit for building plugins for the GxP kiosk platform. Ships a CLI, an interactive TUI, a platform emulator for local dev, a JSON-config linter, and a Model Context Protocol (MCP) server that gives AI coding assistants 29 specialized tools across API specs, config editing, documentation search, and test scaffolding.

## Installation

### Global (recommended)

```bash
npm install -g @gxp-dev/tools
```

### Project-level

```bash
npm install --save-dev @gxp-dev/tools
```

### Updating

```bash
npm update -g @gxp-dev/tools        # global
npm update @gxp-dev/tools           # project-level
```

After updating, run `gxdev init` in existing projects to sync required dependencies, scripts, and config files.

## Quick Start

### New project

```bash
gxdev init my-plugin
cd my-plugin
npm install
npm run dev-http
```

Open `http://localhost:3060`. Press `Ctrl+Shift+D` for the in-browser Dev Tools (Store Inspector, Layout Switcher, Socket Simulator, Mock Data Editor).

### Adding to an existing project

```bash
cd my-existing-project
gxdev init
npm install
npm run dev-http
```

When run in a directory with an existing `package.json` and no name argument, `gxdev init`:

- Adds missing required dependencies and devDependencies (Vue, Pinia, Vite, ESLint, Prettier, Vitest, Vue Test Utils, toolkit itself).
- Sets `"type": "module"` if the field is missing (preserves an explicit `"commonjs"`).
- Adds missing npm scripts (`dev`, `build`, `test`, `lint`, `format`, `prepare`, socket/assets/datastore helpers).
- Copies bundle files: `app-manifest.json`, `configuration.json`, `app-instructions.md`, `vite.extend.js`, `eslint.config.js`, `.prettierrc`, `.githooks/pre-commit`, `.env.example`, store setup, AI agent configs.
- Creates `src/public/` for static assets (served by Vite at `/src/public/*`).

It does **not** overwrite your source files (`src/`, `theme-layouts/`, etc.).

## CLI Commands

| Command                            | Description                                                                                                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gxdev`                            | Launch the interactive TUI                                                                                                                                                                            |
| `gxdev init [name]`                | Create a new project or update an existing one                                                                                                                                                        |
| `gxdev dev`                        | Start the dev server (HTTPS + Vite + Socket.IO)                                                                                                                                                       |
| `gxdev dev --no-https`             | HTTP only                                                                                                                                                                                             |
| `gxdev dev --no-socket`            | Skip the Socket.IO server                                                                                                                                                                             |
| `gxdev dev --with-mock`            | Enable the local Mock API (routes under `/api/*`)                                                                                                                                                     |
| `gxdev dev --chrome`               | Start dev + launch Chrome with the inspector extension                                                                                                                                                |
| `gxdev dev --firefox`              | Start dev + launch Firefox with the inspector extension                                                                                                                                               |
| `gxdev build`                      | Build the plugin for production → `dist/<name>.gxpapp`                                                                                                                                                |
| `gxdev lint [files..]`             | Validate `configuration.json` / `app-manifest.json` against the templating schema. `--all` lints every known config file in the project. `--json` emits machine-readable results.                     |
| `gxdev extract-config`             | Scan `src/` for GxP directives and store calls; merge findings into `app-manifest.json`                                                                                                               |
| `gxdev add-dependency`             | Build an API dependency entry via interactive wizard                                                                                                                                                  |
| `gxdev setup-ssl`                  | Generate local SSL certificates via mkcert                                                                                                                                                            |
| `gxdev publish <file>`             | Copy a runtime file (`main.js`, `index.html`, `server.cjs`, `gxpPortalConfigStore.js`) into the project for customization. For Vite config changes, use `vite.extend.js` at the project root instead. |
| `gxdev datastore <action>`         | Manage the GxP datastore (`list`, `add`, `scan-strings`, `config`)                                                                                                                                    |
| `gxdev socket <action>`            | Simulate socket events (`list`, `send`)                                                                                                                                                               |
| `gxdev assets <action>`            | Manage dev assets (`list`, `init`, `generate`)                                                                                                                                                        |
| `gxdev ext:chrome` / `ext:firefox` | Launch the browser inspector extension                                                                                                                                                                |
| `gxdev ext:build`                  | Build the browser extensions for distribution                                                                                                                                                         |

## Features

- **Platform emulator** — `PortalContainer.vue` mimics the live GxP environment so plugins render exactly like production.
- **Interactive TUI** — terminal UI for managing dev services, streaming logs, and firing slash commands.
- **HMR + HTTPS** — Vite 8 dev server with mkcert-generated certs (or HTTP fallback).
- **GxP Strings Plugin** — `gxp-string` / `gxp-src` / `gxp-settings` / `gxp-state` directives pull live values from the datastore, editable in the in-browser Dev Tools.
- **Socket.IO integration** — real-time events with a local server; CLI `socket send` simulates events on demand.
- **Mock API** — OpenAPI-driven local mock (auto-loads platform specs, routes under `/api/*`).
- **Browser extensions** — Chrome/Firefox DevTools panels for inspecting Vue component trees and GxP state.
- **Config linting** — AJV-based JSON Schema validation of `configuration.json` (form-builder definitions) and `app-manifest.json` (plugin metadata + defaults).
- **Pre-commit hook** — `.githooks/pre-commit` runs Prettier, ESLint, and the GxP linter on staged files; configured automatically via the `prepare` npm script.
- **Unit testing** — Vitest + `@vue/test-utils` wired out of the box; scaffolded tests via the MCP server.
- **MCP server** — 29 tools for AI coding assistants (see below).
- **AI scaffolding** — pre-wired configs for Claude Code, Codex, and Gemini during `init`.

## MCP Server for AI assistants

The toolkit ships `gxp-api-server` (bin `@gxp-dev/tools/mcp/gxp-api-server.js`), an MCP server exposing 29 tools across five families. Point your AI assistant at it to get API-aware, schema-aware, test-aware help inside plugin projects:

| Family                 | Tools                                                                                                                                                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API spec** (6)       | `get_openapi_spec`, `get_asyncapi_spec`, `search_api_endpoints`, `search_websocket_events`, `get_endpoint_details`, `get_api_environment`                                                                                                                                                           |
| **Extended API** (5)   | `api_list_tags`, `api_list_operation_ids`, `api_get_operation_parameters`, `api_find_endpoints_by_schema`, `api_generate_dependency`                                                                                                                                                                |
| **Config editor** (13) | `config_validate`, `config_list_field_types`, `config_list_card_types`, `config_get_field_schema`, `config_list_cards`, `config_list_fields`, `config_add_field`, `config_move_field`, `config_remove_field`, `config_add_card`, `config_move_card`, `config_remove_card`, `config_extract_strings` |
| **Docs search** (3)    | `docs_list_pages`, `docs_search`, `docs_get_page` — full-text across `docs.gxp.dev` via its sitemap                                                                                                                                                                                                 |
| **Test helpers** (2)   | `test_scaffold_component_test`, `test_api_route`                                                                                                                                                                                                                                                    |

Every config mutation is linter-guarded: invalid writes are refused unless `force: true`, so AI agents can't save broken state.

## Project Structure

After `gxdev init`:

```
my-plugin/
├── src/
│   ├── Plugin.vue              # App entry point
│   ├── DemoPage.vue            # Example component
│   ├── public/                 # Static assets (served at /src/public/*)
│   └── stores/
│       └── index.js            # Pinia store setup
├── theme-layouts/              # System/Private/Public layouts
├── dev-assets/images/          # Dev placeholder images
├── socket-events/              # Socket event templates for simulation
├── tests/                      # Vitest test files (scaffolded as you go)
├── scripts/                    # Browser extension launch/pack scripts
├── .githooks/pre-commit        # Prettier + ESLint + gxdev lint on staged files
├── app-manifest.json           # Plugin metadata + default strings/settings/assets
├── app-instructions.md         # End-user onboarding doc (shown on install)
├── configuration.json          # Admin-panel config form definition
├── vite.extend.js              # Optional Vite config extension (aliases, plugins)
├── eslint.config.js            # ESLint flat config (JS + Vue)
├── .prettierrc                 # Prettier config
└── package.json
```

The dev server serves `index.html` and `main.js` from the toolkit runtime — no local copies needed unless you opt in with `USE_LOCAL_INDEX` / `USE_LOCAL_MAIN`.

## Environment Variables

Set in `.env` at the project root:

| Variable                 | Default            | Description                                                                      |
| ------------------------ | ------------------ | -------------------------------------------------------------------------------- |
| `NODE_PORT`              | `3060`             | Dev server port                                                                  |
| `SOCKET_IO_PORT`         | `3069`             | Socket.IO server port                                                            |
| `COMPONENT_PATH`         | `./src/Plugin.vue` | Main component path                                                              |
| `USE_HTTPS`              | `true`             | Enable HTTPS                                                                     |
| `CERT_PATH` / `KEY_PATH` |                    | SSL cert/key paths (auto-set by `setup-ssl`)                                     |
| `USE_LOCAL_INDEX`        |                    | `true` to serve a local `index.html` instead of the runtime version              |
| `USE_LOCAL_MAIN`         |                    | `true` to serve a local `main.js` instead of the runtime version                 |
| `DISABLE_SOURCE_TRACKER` |                    | `true` to skip the source-tracking Vite plugin                                   |
| `DISABLE_INSPECTOR`      |                    | `true` to skip the component inspector plugin                                    |
| `API_ENV`                | `mock`             | API environment (`mock`, `local`, `develop`, `testing`, `staging`, `production`) |
| `MOCK_API_ENABLED`       | `false`            | Mount the local mock API at `/api/*`                                             |
| `ALLOWED_HOSTS`          |                    | Comma-separated list of additional hostnames the dev server should accept        |

## Runtime vs. template

- **Runtime files** stay in `node_modules/@gxp-dev/tools/runtime/` and are used via imports or served by Vite at request time (`index.html`, `main.js`, store, dev tools, Vite config, inspector plugins). Override `index.html` / `main.js` with the `USE_LOCAL_*` env vars. Use `gxdev publish <file>` to copy other runtime files locally.
- **Template files** are copied to your project during `gxdev init` and are fully yours to edit.
- **`vite.extend.js`** at the project root is deep-merged into the runtime Vite config via `mergeConfig` — add aliases, plugins, and `define` keys without replacing the whole config.

## Documentation

- **Full docs**: [docs.gxp.dev](https://docs.gxp.dev)
- **CLI reference**: `gxdev --help` or [docs.gxp.dev/gx-devtools/cli-reference](https://docs.gxp.dev/gx-devtools/cli-reference)
- **Getting started**: [docs.gxp.dev/gx-devtools/getting-started](https://docs.gxp.dev/gx-devtools/getting-started)
- **Platform templating system**: [docs.gxp.dev/platform/plugin-system](https://docs.gxp.dev/platform/plugin-system)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, architecture, and how to extend the toolkit itself.

## License

ISC
