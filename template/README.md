# GxP Plugin Project

This project was scaffolded by `@gxp-dev/tools` and includes the `@gramercytech/gx-componentkit` component library for rapid kiosk/plugin development.

## Quick Start

```bash
npm install
npm run dev-http          # HTTP dev server (or `npm run dev` for HTTPS + Socket.IO)
```

Open `http://localhost:3060`. Press `Ctrl+Shift+D` for the in-browser Dev Tools.

## Project Structure

```
your-project/
├── src/
│   ├── Plugin.vue             # Your app entry point (edit this!)
│   ├── DemoPage.vue           # Example component — strings/assets/socket demo
│   ├── public/                # Static assets, served at /src/public/*
│   └── stores/
│       └── index.js           # Pinia store setup
├── theme-layouts/             # System/Private/Public layout templates
├── dev-assets/images/         # Placeholder images for dev
├── socket-events/             # JSON event templates for simulation
├── tests/                     # Vitest tests (add more as needed)
├── scripts/                   # Browser extension launch/pack scripts
├── .githooks/pre-commit       # Prettier + ESLint + gxdev lint on staged files
├── app-manifest.json          # Plugin metadata + default strings/settings/assets
├── app-instructions.md        # End-user onboarding — shown on install
├── configuration.json         # Admin-panel configuration form (templating schema)
├── vite.extend.js             # Optional Vite config extension (aliases/plugins/define)
├── eslint.config.js           # ESLint flat config (JS + Vue)
├── .prettierrc                # Prettier config
└── .env                       # Environment variables
```

## How it works

### `src/Plugin.vue` — your entry point

During development, the toolkit wraps Plugin.vue in `PortalContainer.vue`, which emulates the live GxP platform. In production the platform loads Plugin.vue directly. The platform injects these props:

```vue
<script setup>
const props = defineProps({
	pluginVars: Object, // Settings configured per-install
	dependencyList: Object, // Linked API dependencies
	assetUrls: Object, // Resolved asset URLs
	stringsList: Object, // Localized strings
	permissionFlags: Array, // Granted permissions
	theme: Object, // Theme configuration
	router: Object, // Platform router
})
</script>
```

### GxP directives

Bind template text and asset sources directly to the datastore — values are editable live from the Dev Tools:

```vue
<!-- text from strings.default -->
<h1 gxp-string="welcome_title">Welcome</h1>

<!-- text from settings (pluginVars) -->
<code gxp-settings gxp-string="primary_color">#FFD600</code>

<!-- text from triggerState -->
<code gxp-state gxp-string="current_status">idle</code>

<!-- swap the image src from assets -->
<img gxp-src="hero_image" src="/src/public/hero.jpg" />
```

### Theme layouts

`theme-layouts/` wraps your plugin. Customize to match your kiosk's design:

- **SystemLayout.vue** — system pages (errors, maintenance)
- **PrivateLayout.vue** — authenticated pages
- **PublicLayout.vue** — public-facing pages

## npm scripts

| Script                                                                             | What it does                                   |
| ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| `npm run dev`                                                                      | HTTPS dev server + Socket.IO + interactive TUI |
| `npm run dev-app`                                                                  | HTTPS dev server only                          |
| `npm run dev-http`                                                                 | HTTP dev server (no SSL)                       |
| `npm run build`                                                                    | Production build → `dist/<name>.gxpapp`        |
| `npm run test`                                                                     | Run Vitest once                                |
| `npm run test:watch`                                                               | Vitest in watch mode                           |
| `npm run lint`                                                                     | Run `gxdev lint --all` (config/manifest JSON)  |
| `npm run lint:js`                                                                  | Run ESLint on JS/Vue files                     |
| `npm run format`                                                                   | Run Prettier across the project                |
| `npm run setup-ssl`                                                                | Generate SSL certificates via mkcert           |
| `npm run socket:list`                                                              | List available socket events                   |
| `npm run socket:send`                                                              | Send a test socket event                       |
| `npm run assets:list` / `assets:init` / `assets:generate`                          | Manage dev assets                              |
| `npm run datastore:list` / `datastore:add` / `datastore:scan` / `datastore:config` | Manage the GxP datastore                       |

## Development tooling

### In-browser Dev Tools

Press **Ctrl+Shift+D** (or Cmd+Shift+D on macOS) to open:

1. **Store Inspector** — view/edit `pluginVars` (settings), `stringsList`, `assetList`, `triggerState`, `dependencyList`. Hover a key to highlight every matching element; double-click a value to edit.
2. **Layout Switcher** — swap between Public / Private / System layouts.
3. **Socket Simulator** — fire test socket events.
4. **Mock Data Editor** — edit theme colors, nav, session, permissions.

Console API:

```js
window.gxDevTools.open() // open
window.gxDevTools.close() // close
window.gxDevTools.toggle() // toggle
window.gxDevTools.store() // grab the Pinia store
```

### Pre-commit hook

The `.githooks/pre-commit` hook runs on every `git commit` (auto-enabled by the `prepare` npm script):

1. **Prettier** formats every staged JS/TS/Vue/CSS/JSON/MD/YAML/HTML file.
2. **ESLint** fixes every staged JS/Vue file.
3. **`gxdev lint`** validates staged `configuration.json` / `app-manifest.json` against the GxP templating schema.

Any non-zero exit aborts the commit. To stage fixes, ESLint and Prettier re-add their outputs automatically.

### Linting config JSON

`gxdev lint` uses AJV + the GxP templating schema to validate:

- **`configuration.json`** — the admin form definition (cards, fields, nested card_list / tabs_list structures).
- **`app-manifest.json`** — plugin metadata, strings/settings/assets/triggerState shapes, dependency entries.

Run manually with `npm run lint`, or point at a single file: `gxdev lint path/to/file.json`.

### Writing tests

Tests live under `tests/` and run with Vitest:

```js
import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import DemoPage from "@/DemoPage.vue"

describe("DemoPage", () => {
	it("renders", () => {
		const wrapper = mount(DemoPage)
		expect(wrapper.exists()).toBe(true)
	})
})
```

Scaffold a new test with the MCP tool `test_scaffold_component_test` (via an AI assistant) or write them by hand. Run with `npm run test` or `npm run test:watch`.

### Customizing the Vite config

Don't replace `vite.config.js` — the toolkit serves one from its runtime. Instead, edit `vite.extend.js` at the project root. Its exports are deep-merged into the runtime config via `mergeConfig` (plugins concatenate, `resolve.alias` / `define` merge key-by-key):

```js
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default {
	resolve: {
		alias: {
			"@components": path.resolve(__dirname, "src/components"),
			"@pages": path.resolve(__dirname, "src/pages"),
		},
	},
	// plugins: [somePlugin()],
	// define: { "import.meta.env.VITE_MY_FLAG": JSON.stringify("value") },
}
```

## Environment variables

Set in `.env`:

| Variable                             | Default            | Description                                                                      |
| ------------------------------------ | ------------------ | -------------------------------------------------------------------------------- |
| `NODE_PORT`                          | `3060`             | Dev server port                                                                  |
| `SOCKET_IO_PORT`                     | `3069`             | Socket.IO server port                                                            |
| `COMPONENT_PATH`                     | `./src/Plugin.vue` | Main component path                                                              |
| `USE_HTTPS`                          | `true`             | Enable HTTPS                                                                     |
| `CERT_PATH` / `KEY_PATH`             |                    | SSL cert paths (auto-set by `setup-ssl`)                                         |
| `USE_LOCAL_INDEX` / `USE_LOCAL_MAIN` |                    | Opt into local copies of `index.html` / `main.js`                                |
| `API_ENV`                            | `mock`             | API environment (`mock`, `local`, `develop`, `testing`, `staging`, `production`) |
| `MOCK_API_ENABLED`                   | `false`            | Mount the local mock API at `/api/*`                                             |

## `app-manifest.json` overview

Plugin metadata + default datastore values loaded by the platform on install:

```json
{
	"name": "My Plugin",
	"version": "1.0.0",
	"manifest_version": 3,
	"asset_dir": "/src/public",
	"configurationFile": "configuration.json",
	"appInstructionsFile": "app-instructions.md",
	"defaultStylingFile": "default-styling.css",
	"settings": { "primary_color": "#FFD600" },
	"strings": { "default": { "welcome_title": "Welcome" } },
	"assets": { "main_logo": "/src/public/logo.png" },
	"triggerState": { "current_status": "idle" },
	"dependencies": [],
	"permissions": []
}
```

Run `gxdev extract-config` to scan `src/` for directives and store calls and merge new keys into the manifest automatically.

## `configuration.json` — admin form

This file defines the configuration form operators see when installing/configuring your plugin in the admin panel. It follows the GxP templating system (`additionalTabs` → cards → fields). A minimal example:

```json
{
	"additionalTabs": [
		{
			"type": "card_list",
			"cards": [
				{
					"type": "fields_list",
					"title": "General",
					"fieldsList": [
						{ "type": "text", "name": "company_name", "label": "Company" },
						{
							"type": "colorPicker",
							"name": "primary_color",
							"label": "Brand color"
						}
					]
				}
			]
		}
	]
}
```

Full reference: [docs.gxp.dev/gx-devtools/app-manifest](https://docs.gxp.dev/gx-devtools/app-manifest) and the platform templating docs. Validate any time with `gxdev lint configuration.json`.

## GX ComponentKit

This project includes `@gramercytech/gx-componentkit`:

- **Pages** — `GxPageStart`, `GxPageInstructions`, `GxPageCamera`, `GxPageResults`, `GxPageShare`, `GxPageFinal`, `GxPageLoading`
- **UI** — `GxModal`, `GxCountdown`, `GxVideoPlayer`, `GxThemeWrapper`
- **Composables** — `useMedia`, `useAnimations`, `useScanning`, `useErrors`

Theme CSS variables are auto-injected:

```css
.my-component {
	background: var(--gx-primary-color);
	color: var(--gx-text-color);
}
```

## Socket events

```bash
npm run socket:list
npm run socket:send
gxdev socket send --event SocialStreamPostCreated --identifier "stream_123"
```

Event templates live in `socket-events/` — add JSON files to simulate custom events.

## Assets

```bash
npm run assets:list
npm run assets:init
npm run assets:generate
gxdev assets generate --size 800x600 --name product-image
```

Requires ImageMagick:

```bash
brew install imagemagick            # macOS
sudo apt-get install imagemagick    # Ubuntu/Debian
```

## Building for production

```bash
npm run build
```

Produces `dist/<plugin-name>.gxpapp` — a zip containing compiled `plugin.es.js`, `style.css`, `app-manifest.json`, assets, and any bundled files referenced by the manifest. Upload this to the GxP plugin registry.

## Learn more

- **Platform docs** — [docs.gxp.dev](https://docs.gxp.dev)
- **CLI reference** — [docs.gxp.dev/gx-devtools/cli-reference](https://docs.gxp.dev/gx-devtools/cli-reference)
- **ComponentKit** — [docs.gxp.dev/gx-uikit](https://docs.gxp.dev/gx-uikit)
- **Vue 3** — [vuejs.org](https://vuejs.org/)
- **Vite** — [vitejs.dev](https://vitejs.dev/)

## Support

Contact the Gramercy development team or open an issue in the plugin repo.
