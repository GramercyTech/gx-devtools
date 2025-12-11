---
sidebar_position: 2
title: Getting Started
description: Install the GxP Toolkit and create your first plugin project
---

# Getting Started

This guide walks you through installing the GxP Toolkit and creating your first plugin project.

## Prerequisites

Before you begin, ensure you have:

- **Node.js 18+** - [Download Node.js](https://nodejs.org/)
- **npm 8+** - Comes with Node.js
- **Code editor** - VS Code recommended

## Installation

### Option 1: Global Installation (Recommended)

Install the toolkit globally to use the `gxdev` command anywhere:

```bash
npm install -g @gramercytech/gx-devtools
```

### Option 2: Project-Level Installation

Or install as a dev dependency in an existing project:

```bash
npm install --save-dev @gramercytech/gx-devtools
```

## Create a New Plugin

### 1. Initialize Your Project

Create a new plugin project using the interactive CLI:

```bash
gxdev init my-plugin
```

Or run without arguments to be prompted for a name:

```bash
gxdev init
```

### 2. Interactive Configuration

After the project files are created and dependencies installed, you'll enter an interactive configuration wizard:

```
──────────────────────────────────────────────────
📝 Configure Your Plugin
──────────────────────────────────────────────────

? App name
❯ my-plugin - From package.json
  Enter custom name

? Description
❯ A GxP kiosk plugin - From package.json
  Enter custom description
```

Use **arrow keys** to select options:
- First option is prepopulated from package.json
- Second option lets you enter a custom value

### 3. AI-Powered Scaffolding (Optional)

Next, you'll be asked if you want AI to help scaffold your plugin. The wizard detects which AI providers are available on your system:

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

If you select a provider, describe your plugin:

```
📝 Describe your plugin (what it does, key features, UI elements):
  (Press Enter twice when done)

  > A conference check-in kiosk with a welcome screen,
  > badge scanner input field, and confirmation display
  >
```

#### Supported AI Providers

| Provider | Authentication |
|----------|----------------|
| **Claude** | Claude CLI logged in (`claude login`) |
| **Codex** | Codex CLI logged in (`codex auth`) |
| **Gemini** | Gemini CLI, API key (`GEMINI_API_KEY`), or gcloud CLI |

**Setting up providers:**

```bash
# Claude (uses your Anthropic account)
npm install -g @anthropic-ai/claude-code
claude login

# Codex (uses your OpenAI account)
npm install -g @openai/codex
codex auth

# Gemini CLI (recommended - uses your Google account)
npm install -g @google/gemini-cli
gemini  # First run will prompt for login

# Gemini (API key)
export GEMINI_API_KEY=your_google_ai_api_key

# Gemini (gcloud)
gcloud auth login
```

### 4. SSL Setup

Choose whether to set up SSL certificates:

```
──────────────────────────────────────────────────
🔒 SSL Configuration
──────────────────────────────────────────────────

? Set up SSL certificates for HTTPS development?
❯ Yes, set up SSL - Recommended for full feature access
  Skip SSL setup - Can be set up later with npm run setup-ssl
```

### 5. Start Development

Choose how to start the development server:

```
──────────────────────────────────────────────────
🚀 Start Development
──────────────────────────────────────────────────

? How would you like to start the development server?
❯ Start app - HTTPS dev server
  Start app with Mock API - Dev server + Socket.IO + Mock API
  Skip
```

### 6. Browser Extension (Optional)

If starting the app, choose to launch a browser with the GxP extension:

```
? Launch browser with GxP extension?
❯ Chrome - Launch Chrome with DevTools panel
  Firefox - Launch Firefox with DevTools panel
  Skip
```

### Non-Interactive Mode

For CI/CD or scripting, use command-line flags:

```bash
# Basic creation
gxdev init my-plugin -d "My awesome plugin"

# With AI scaffolding (defaults to Gemini)
gxdev init checkin-kiosk -d "Conference check-in" \
  -b "A check-in kiosk with welcome screen and badge scanner"

# With specific AI provider
gxdev init checkin-kiosk -d "Conference check-in" \
  -b "A check-in kiosk" -p claude
```

Available providers: `claude`, `codex`, `gemini`

Your plugin is now running at `https://localhost:3060` (or `http://localhost:3060`).

## Project Structure

After initialization, your project looks like this:

```
my-plugin/
├── src/
│   ├── Plugin.vue          # Main plugin entry point
│   ├── DemoPage.vue        # Example component
│   └── stores/
│       └── index.js        # Store setup
├── theme-layouts/
│   ├── PublicLayout.vue    # Public-facing layout
│   ├── PrivateLayout.vue   # Authenticated layout
│   └── SystemLayout.vue    # System/admin layout
├── .claude/
│   ├── agents/
│   │   └── gxp-developer.md # Claude Code subagent
│   └── settings.json       # MCP server configuration
├── dev-assets/
│   └── images/             # Development placeholder images
├── app-manifest.json       # Plugin configuration
├── AGENTS.md               # Codex/AI agent instructions
├── GEMINI.md               # Gemini Code Assist instructions
├── vite.config.js          # Vite configuration
├── main.js                 # Development entry point
├── index.html              # Development HTML template
└── .env                    # Environment variables
```

## Your First Edit

Open `src/Plugin.vue` and make a change:

```vue
<template>
  <div class="my-plugin">
    <h1 gxp-string="welcome_title">Welcome to My Plugin!</h1>
    <p>Edit this file to get started.</p>
  </div>
</template>

<script setup>
import { useGxpStore } from '@gx-runtime/stores/gxpPortalConfigStore';

const store = useGxpStore();
</script>
```

The page automatically refreshes with your changes.

## SSL Setup (Optional)

For HTTPS development (required for some platform features):

```bash
npm run setup-ssl
```

This uses [mkcert](https://github.com/FiloSottile/mkcert) to generate trusted local certificates.

## Using the Interactive TUI

After creating your project, run `gxdev` without arguments from the project directory to launch the interactive Terminal UI:

```bash
cd my-plugin
gxdev
```

:::tip
After `gxdev init` completes, you'll be prompted to launch the TUI automatically. The TUI is for managing services within an existing project—use `gxdev init` from the CLI to create new projects.
:::

The TUI provides:

- **Service management** - Start/stop Vite, Socket.IO, extensions
- **Log viewing** - Real-time logs from all services
- **Slash commands** - Quick actions like `/dev`, `/socket`, `/ext chrome`

### TUI Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+1/2/3...` | Switch service tabs |
| `Ctrl+L` | Clear current log |
| `Ctrl+C` | Exit application |
| `Up/Down` | Scroll log panel |

## Next Steps

- [Configure your app manifest](./app-manifest) - Set up strings, settings, and assets
- [Learn the GxP Store](./gxp-store) - State management and platform integration
- [Use Dev Tools](./dev-tools) - Debug and inspect your plugin
- [Build for platform](./building-for-platform) - Prepare for production deployment

## Common Commands Reference

```bash
# Development
gxdev dev                    # Start with TUI + Vite
gxdev dev --no-https         # Start without SSL
gxdev dev --with-socket      # Include Socket.IO server
gxdev dev --chrome           # Launch with Chrome extension
gxdev dev --firefox          # Launch with Firefox extension

# Building
gxdev build                  # Build for production

# Utilities
gxdev datastore list         # List store variables
gxdev datastore scan-strings # Find hardcoded strings
gxdev socket list            # List socket events
gxdev assets generate        # Generate placeholder images
```
