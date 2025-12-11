---
sidebar_position: 10
title: Interactive TUI
description: Terminal User Interface for managing GxP development services
---

# Interactive TUI

The GxP Toolkit includes an interactive Terminal User Interface (TUI) for managing development services. Launch it by running `gxdev` without arguments from within an existing project.

:::note
The TUI is designed for managing running services within an existing project. To create a new project, use `gxdev init` from the command line first. After initialization completes, you'll be offered to launch the TUI automatically.
:::

## Quick Start

```bash
# Launch the TUI
gxdev

# Auto-start with Vite dev server
gxdev dev

# Auto-start with specific options
gxdev dev --with-socket --chrome
```

## Interface Overview

```
┌─────────────────────────────────────────────────────────────┐
│  GxP DevTools v2.0.0  │  my-plugin                          │  ← Header
├─────────────────────────────────────────────────────────────┤
│  [System] [Vite] [Socket] [Chrome]                          │  ← Tab Bar
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Service logs appear here...                                │  ← Log Panel
│  Each tab shows logs from its service                       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  > /dev --with-socket                                       │  ← Command Input
│  Ctrl+C: Exit  Ctrl+L: Clear  Tab: Switch tabs             │  ← Hints
└─────────────────────────────────────────────────────────────┘
```

### Components

| Component | Description |
|-----------|-------------|
| **Header** | Shows version and current project name |
| **Tab Bar** | Service tabs with status indicators |
| **Log Panel** | Real-time logs from the active service |
| **Command Input** | Slash command entry with autocomplete |
| **Hints** | Keyboard shortcuts reference |

## Services

The TUI manages multiple services, each with its own tab:

| Service | Tab Name | Description |
|---------|----------|-------------|
| System | System | General messages and help output |
| Vite | Vite | Development server logs |
| Socket.IO | Socket | Socket server logs (if enabled) |
| Chrome | Chrome | Chrome extension launcher |
| Firefox | Firefox | Firefox extension launcher |

### Service Status Indicators

Each tab shows the service status:

| Indicator | Status |
|-----------|--------|
| `●` (green) | Running |
| `○` (gray) | Stopped |
| `◐` (yellow) | Starting |
| `✕` (red) | Error |

## Slash Commands

Enter commands in the input field. All commands start with `/`.

### Development Commands

```bash
/dev                    # Start Vite dev server
/dev --with-socket      # Start Vite + Socket.IO
/dev --with-mock        # Start Vite + Socket.IO + Mock API
/dev --no-socket        # Start Vite only (skip Socket.IO even if enabled)
/dev --no-https         # Start without SSL
/dev --firefox          # Start + launch Firefox extension
/dev --chrome           # Start + launch Chrome extension
```

### Socket Commands

```bash
/socket                 # Start Socket.IO server
/socket --with-mock     # Start with Mock API enabled
/socket list            # List available socket events
/socket send <event>    # Send a socket event
/socket send <event> <id>  # Send with custom identifier
```

### Extension Commands

```bash
/ext chrome            # Launch Chrome with extension
/ext firefox           # Launch Firefox with extension
```

### Service Management

```bash
/stop                  # Stop current service
/stop <service>        # Stop specific service (vite, socket, ext-chrome, ext-firefox)
/restart               # Restart current service
/restart <service>     # Restart specific service
```

### Utility Commands

```bash
/clear                 # Clear current log panel
/help                  # Show help message
/quit                  # Exit the TUI
/exit                  # Exit the TUI
```

### AI Assistant (Gemini)

The TUI includes optional Gemini AI integration:

```bash
/gemini                # Open Gemini chat panel
/gemini enable         # Set up Google authentication
/gemini ask <query>    # Quick question to Gemini
/gemini status         # Check authentication status
/gemini logout         # Log out from Gemini
/gemini clear          # Clear conversation history
```

**Note:** Gemini integration requires Google OAuth authentication. Run `/gemini enable` first.

## Keyboard Shortcuts

### Navigation

| Shortcut | Action |
|----------|--------|
| `Tab` | Cycle to next tab |
| `Shift+Tab` | Cycle to previous tab |
| `←` / `→` | Switch tabs (left/right) |
| `Cmd+1` through `Cmd+9` | Jump to tab by number |
| `Ctrl+1` through `Ctrl+9` | Jump to tab by number (alternative) |

### Log Panel

| Shortcut | Action |
|----------|--------|
| `Shift+↑` | Scroll logs up |
| `Shift+↓` | Scroll logs down |
| `Cmd+↑` | Jump to top of logs |
| `Cmd+↓` | Jump to bottom of logs |
| `Ctrl+L` | Clear current log panel |

### Service Control

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Stop current service |
| `Ctrl+C` | Exit application (stops all services) |

### Command Input

| Shortcut | Action |
|----------|--------|
| `↑` | Previous command (history) |
| `↓` | Next command (history) |
| `Tab` | Autocomplete command |
| `Enter` | Execute command |
| `Escape` | Clear input |

## Command Autocomplete

The TUI provides intelligent autocomplete:

1. Type `/` to start a command
2. Type partial command name
3. Press `Tab` to see suggestions
4. Use `↑`/`↓` to navigate suggestions
5. Press `Enter` to select

Example:
```
> /de          # Type partial command
  /dev         # Autocomplete suggestion
  /dev --with-socket
  /dev --no-https
```

## Service Auto-Start

When using `gxdev dev`, services auto-start based on flags:

```bash
# Starts Vite only
gxdev dev

# Starts Vite + Socket.IO
gxdev dev --with-socket

# Starts Vite + Socket.IO + Mock API
gxdev dev --with-mock

# Starts Vite + Socket.IO + Chrome extension
gxdev dev --with-socket --chrome
```

Environment variable `SOCKET_IO_ENABLED=true` makes Socket.IO auto-start with `/dev`.

## Log Panel Features

### ANSI Color Support

The log panel renders ANSI color codes for formatted output:
- Vite's colored output
- Error highlighting
- Success/warning indicators

### Auto-Scroll

The log panel auto-scrolls to show new content. Scrolling up disables auto-scroll until you return to the bottom.

### Log Persistence

Logs are kept in memory for the session. Use `/clear` to reset the current tab's logs.

## Welcome Screen

When no services are running, the TUI shows a welcome screen with:
- Quick start commands
- Keyboard shortcut reference
- Project information

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│     Welcome to GxP DevTools                                 │
│                                                             │
│     Quick Start:                                            │
│       /dev              Start development server            │
│       /dev --with-socket  Start with Socket.IO             │
│       /help             Show all commands                   │
│                                                             │
│     Press Tab to cycle tabs, Ctrl+C to exit                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Gemini AI Panel

When Gemini is authenticated, `/gemini` opens an interactive chat panel:

```
┌─────────────────────────────────────────────────────────────┐
│  Gemini AI Assistant                              [ESC: Close] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  You: How do I add a new string to the store?              │
│                                                             │
│  Gemini: To add a new string to the store, you can:        │
│  1. Edit app-manifest.json and add to strings.default      │
│  2. Use gxdev datastore add --type string ...              │
│  3. Call store.updateString('key', 'value') in code        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  > Ask Gemini something...                                  │
└─────────────────────────────────────────────────────────────┘
```

### Gemini Features

- **Project Context** - Gemini is aware of your project structure
- **Conversation History** - Multi-turn conversations
- **Code Suggestions** - Can provide code examples
- **Documentation Help** - Answers questions about GxP

## Configuration

### Environment Variables

The TUI respects these environment variables:

| Variable | Description |
|----------|-------------|
| `NODE_PORT` | Dev server port (default: 3060) |
| `SOCKET_IO_PORT` | Socket server port (default: 3069) |
| `SOCKET_IO_ENABLED` | Auto-start Socket.IO with /dev |
| `USE_HTTPS` | Use HTTPS for dev server |

### Project Detection

The TUI auto-detects:
- Project name from `package.json`
- Available socket events from `socket-events/`
- Extension paths in `browser-extensions/`

## Error Handling

### Service Crashes

If a service crashes:
1. The tab indicator turns red
2. Error output appears in the log
3. The service can be restarted with `/restart`

### Port Conflicts

If a port is in use:
```
Error: Port 3060 is already in use
```

Solutions:
1. Stop the conflicting process
2. Set a different port in `.env`
3. Use `--port` flag (if available)

### Extension Launch Failures

If browser extension fails to launch:
1. Check browser is installed
2. Verify extension directory exists
3. Check browser isn't already running with conflicting profile

## Building the TUI

The TUI is built with TypeScript and Ink (React for terminal):

```bash
# Build TUI (in gx-devtools repo)
npm run build:tui

# Watch mode for development
npm run dev:tui
```

### Architecture

```
bin/lib/tui/
├── index.tsx           # Entry point
├── App.tsx             # Main application component
├── components/
│   ├── Header.tsx      # Header bar
│   ├── TabBar.tsx      # Service tabs
│   ├── LogPanel.tsx    # Log output area
│   ├── CommandInput.tsx # Input with autocomplete
│   ├── WelcomeScreen.tsx # Initial welcome
│   └── GeminiPanel.tsx # AI chat panel
├── services/
│   ├── index.ts        # Service exports
│   ├── vite.ts         # Vite service manager
│   ├── socket.ts       # Socket.IO service
│   ├── extension.ts    # Browser extension launchers
│   └── gemini.ts       # Gemini AI integration
└── commands/           # Command handlers
```

## Tips and Tricks

### Quick Development Start

```bash
# One command to start everything
gxdev dev --with-socket --chrome
```

### Monitor Multiple Services

Use `Cmd+1`, `Cmd+2`, etc. to quickly jump between service tabs while monitoring logs.

### Test Socket Events

1. Start with `/dev --with-socket`
2. Run `/socket list` to see available events
3. Run `/socket send EventName` to test
4. Check your plugin's response in the Vite tab

### Clear and Restart

```bash
/clear          # Clear logs
/restart vite   # Restart dev server
```

### Quick Exit

Press `Ctrl+C` to gracefully stop all services and exit. All child processes are terminated.
