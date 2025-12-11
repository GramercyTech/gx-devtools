---
sidebar_position: 1
title: GxP Toolkit Overview
description: Introduction to the GxP Dev Toolkit for building platform plugins
slug: /gx-devtools
---

# GxP Dev Toolkit

The GxP Dev Toolkit (`@gramercytech/gx-devtools`) is an npm package for creating platform plugins for the GxP kiosk platform.

## What You Can Build

With the GxP Toolkit, you can create custom plugins that run on GxP kiosks, including:

- **Interactive displays** - Check-in kiosks, registration flows, badge printing
- **Information screens** - Schedules, maps, directories
- **Engagement features** - Surveys, gamification, social walls
- **Custom integrations** - Connect to external APIs and services

## Key Features

| Feature | Description |
|---------|-------------|
| **CLI Tool (`gxdev`)** | Project scaffolding, dev server, and build commands |
| **Interactive TUI** | Terminal UI for managing dev services |
| **Hot Reload** | Vite-based dev server with instant updates |
| **GxP Strings Plugin** | Vue directives for reactive string/asset replacement |
| **Socket.IO** | Real-time event simulation |
| **Browser Extensions** | Chrome/Firefox DevTools for plugin inspection |
| **Vue 3 + Pinia** | Modern reactive framework with state management |
| **Component Kit** | Pre-built UI components for kiosk development |

## Quick Start

```bash
# Install globally
npm install -g @gramercytech/gx-devtools

# Create a new project
mkdir my-plugin && cd my-plugin
gxdev init my-plugin

# Start development
npm run dev-http
```

Your plugin is now running at `http://localhost:3060`. Open the Dev Tools with `Ctrl+Shift+D`.

## Documentation

### Getting Started

- [Getting Started](./getting-started) - Install and create your first plugin
- [Project Architecture](./architecture) - Understand how the toolkit and plugins are structured

### Configuration

- [App Manifest](./app-manifest) - Configure plugin settings, strings, and assets
- [GxP Store](./gxp-store) - State management and platform integration
- [GxP Strings Plugin](./strings-plugin) - Vue directives for reactive content

### Development Tools

- [Interactive TUI](./interactive-tui) - Terminal UI for managing services
- [Dev Tools](./dev-tools) - In-browser debugging and inspection
- [Browser Extensions](./browser-extensions) - Chrome/Firefox inspector extensions
- [Socket.IO Events](./socket-events) - Real-time event simulation

### Reference

- [CLI Reference](./cli-reference) - Complete gxdev command reference
- [AI Agent Configuration](./ai-agents) - Configure AI coding assistants
- [Building for Platform](./building-for-platform) - Prepare your plugin for production
- [Troubleshooting & FAQ](./troubleshooting) - Common issues and solutions

## Requirements

- Node.js 18 or higher
- npm 8 or higher
- Modern browser (Chrome, Firefox, Safari, Edge)

## Installation

### Global Installation (Recommended)

```bash
npm install -g @gramercytech/gx-devtools
```

This makes the `gxdev` command available globally.

### Project-Level Installation

```bash
npm install --save-dev @gramercytech/gx-devtools
```

Use `npx gxdev` to run commands.

## Common Workflows

### Create a New Plugin

```bash
mkdir my-plugin && cd my-plugin
gxdev init my-plugin
npm run dev-http
```

### Start Development with Full Services

```bash
# Start Vite + Socket.IO + Chrome extension
gxdev dev --with-socket --chrome
```

### Build for Production

```bash
gxdev build
# Output: dist/my-plugin.gxpapp
```

### Test Socket Events

```bash
# List available events
gxdev socket list

# Send a test event
gxdev socket send --event AiSessionMessageCreated
```

### Generate Placeholder Images

```bash
gxdev assets generate --size 800x600 --name hero
```

## Project Structure After Init

```
my-plugin/
├── src/
│   ├── Plugin.vue          # Main plugin entry point
│   ├── DemoPage.vue        # Example component
│   ├── assets/             # Your static assets
│   └── stores/             # Pinia store setup
├── theme-layouts/          # Layout components (Public, Private, System)
├── socket-events/          # Socket event templates
├── dev-assets/             # Development placeholder images
├── app-manifest.json       # Plugin configuration
├── .env                    # Environment variables
└── package.json
```

## Key Concepts

### Runtime vs Template

- **Runtime files** - Stay in `node_modules/`, imported via `@gx-runtime`
- **Template files** - Copied to your project, fully customizable

### GxP Store

Central Pinia store providing:
- Settings (`pluginVars`)
- Translatable strings (`stringsList`)
- Asset URLs (`assetList`)
- Dynamic state (`triggerState`)
- API client methods
- Socket.IO integration

### GxP Directives

```html
<!-- Replace text content from strings -->
<h1 gxp-string="welcome_title">Default Text</h1>

<!-- Replace image source from assets -->
<img gxp-src="hero_image" src="/placeholder.jpg" alt="Hero">
```

### Dev Tools

Press `Ctrl+Shift+D` to open in-browser Dev Tools:
- Store Inspector (edit values in real-time)
- Layout Switcher
- Socket Simulator
- Mock Data Editor

## Getting Help

- **Documentation**: Browse the pages linked above
- **TUI Help**: Run `gxdev` and type `/help`
- **CLI Help**: Run `gxdev --help` or `gxdev <command> --help`
- **Issues**: [GitHub Issues](https://github.com/gramercytech/gx-devtools/issues)
