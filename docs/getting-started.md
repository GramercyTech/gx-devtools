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

Install the toolkit globally to use the `gxtk` command anywhere:

```bash
npm install -g @gramercytech/gx-toolkit
```

### Option 2: Project-Level Installation

Or install as a dev dependency in an existing project:

```bash
npm install --save-dev @gramercytech/gx-toolkit
```

## Create a New Plugin

### 1. Initialize Your Project

Create a new plugin project using the CLI:

```bash
# Create a new directory and initialize
mkdir my-plugin
cd my-plugin
gxtk init my-plugin
```

This creates a complete project structure with:

- `src/Plugin.vue` - Your main plugin component
- `app-manifest.json` - Plugin configuration
- `theme-layouts/` - Layout components for different contexts
- `dev-assets/` - Development placeholder assets

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Development Server

Start the development server with hot reload:

```bash
# With HTTPS (recommended)
npm run dev

# Without HTTPS (simpler setup)
npm run dev-http
```

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
├── dev-assets/
│   └── images/             # Development placeholder images
├── app-manifest.json       # Plugin configuration
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

Run `gxtk` without arguments to launch the interactive Terminal UI:

```bash
gxtk
```

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
gxtk dev                    # Start with TUI + Vite
gxtk dev --no-https         # Start without SSL
gxtk dev --with-socket      # Include Socket.IO server
gxtk dev --chrome           # Launch with Chrome extension
gxtk dev --firefox          # Launch with Firefox extension

# Building
gxtk build                  # Build for production

# Utilities
gxtk datastore list         # List store variables
gxtk datastore scan-strings # Find hardcoded strings
gxtk socket list            # List socket events
gxtk assets generate        # Generate placeholder images
```
