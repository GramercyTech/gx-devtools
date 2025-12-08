---
sidebar_position: 1
title: GxP Toolkit Overview
description: Introduction to the GxP Dev Toolkit for building platform plugins
slug: /gx-toolkit
---

# GxP Dev Toolkit

The GxP Dev Toolkit (`@gramercytech/gx-toolkit`) is an npm package for creating platform plugins for the GxP kiosk platform.

## What You Can Build

With the GxP Toolkit, you can create custom plugins that run on GxP kiosks, including:

- **Interactive displays** - Check-in kiosks, registration flows, badge printing
- **Information screens** - Schedules, maps, directories
- **Engagement features** - Surveys, gamification, social walls
- **Custom integrations** - Connect to external APIs and services

## Key Features

| Feature | Description |
|---------|-------------|
| **CLI Tool** | `gxtk` command for scaffolding and development |
| **Interactive TUI** | Terminal UI for managing dev services |
| **Hot Reload** | Vite-based dev server with instant updates |
| **Socket.IO** | Real-time event simulation |
| **Browser Extensions** | Test plugins in production environments |
| **Vue 3 + Pinia** | Modern reactive framework with state management |

## Quick Links

- [Getting Started](./getting-started) - Install and create your first plugin
- [App Manifest](./app-manifest) - Configure your plugin settings, strings, and assets
- [GxP Store](./gxp-store) - State management and platform integration
- [Dev Tools](./dev-tools) - In-browser debugging and inspection
- [Building for Platform](./building-for-platform) - Prepare your plugin for production

## Requirements

- Node.js 18 or higher
- npm 8 or higher
- Modern browser (Chrome, Firefox, Safari, Edge)
