# App Instructions

> **👋 Plugin developer — replace this file.**
>
> Everything in this file is shown to **end users** on the GxP platform the first
> time they install your plugin. Treat it like the "About" screen of your app:
> what it does, how to use it, what to expect. Strip out the template sections
> below and write for your audience, not for developers.
>
> _Delete this callout before shipping._

---

## About GxP plugins

GxP plugins are self-contained Vue apps that run inside the Gramercy Experience
Platform. Your plugin gets:

- A slice of platform UI to render into (Public, Private, or System layout).
- A reactive **datastore** populated at runtime with strings, settings, assets,
  permissions, and feature flags configured by the platform operator.
- **Sockets** for real-time events (default channel: `primary`).
- Optional **dependencies** — models and event streams provided by other
  plugins or platform modules.

Plugins are packaged as a `.gxpapp` bundle and distributed through the GxP
plugin registry.

## Getting started (for developers)

```bash
# Install the toolkit CLI (already listed as a devDependency)
npm install

# Start the dev server (HTTPS by default)
npm run dev

# …or launch the interactive TUI
gxdev
```

Then open the browser to the dev URL printed in the console.

**Key files:**

| File                  | What it does                                                         |
| --------------------- | -------------------------------------------------------------------- |
| `src/Plugin.vue`      | Your app's entry point. Rendered by the platform.                    |
| `app-manifest.json`   | Plugin metadata + default strings, settings, assets, permissions.    |
| `src/public/`         | Static assets (images, fonts). Served at `/src/public/*`.            |
| `vite.extend.js`      | Optional — extends the runtime Vite config (aliases, plugins, etc.). |
| `app-instructions.md` | **This file.** Shown to end users — replace it.                      |
| `configuration.json`  | Per-install configuration schema shown to operators.                 |
| `default-styling.css` | Optional stylesheet bundled with the plugin.                         |

**Dev tools:** press `Ctrl+Shift+D` in the running app to open the in-browser
Store Inspector, layout switcher, socket simulator, and mock-data editor.

## Building and packaging

```bash
npm run build     # produces dist/<plugin-name>.gxpapp
```

The `.gxpapp` file is what you upload to the GxP plugin registry.

---

## Template — end-user-facing content starts here

> Everything below is placeholder copy. Replace it with your app's actual
> user-facing content.

### What is this plugin?

_A one-or-two-sentence description of what the plugin does and why a user
would install it._

### How to use it

1. _First step the user should take._
2. _Second step._
3. _…_

### Frequently asked questions

**Can I customize the colors or text?**
_Answer that covers whatever your `configuration.json` exposes to operators._

**Who do I contact for support?**
_Your support contact / link._
