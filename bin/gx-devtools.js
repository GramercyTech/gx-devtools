#!/usr/bin/env node

/**
 * GxToolkit CLI
 *
 * This tool works both as a globally installed npm package and as a local dependency.
 * It provides commands for creating new GxP projects and managing development workflows.
 *
 * Commands:
 *   (no command)    - Launch interactive TUI (Terminal UI)
 *   init [name]     - Initialize a new GxP project or update existing one
 *   setup-ssl       - Setup SSL certificates for HTTPS development
 *   dev             - Start development server (launches TUI with auto-start)
 *   build           - Build plugin for production
 *   publish [file]  - Publish package files to local project
 *   datastore       - Manage GxP datastore
 *   socket          - Simulate socket events (launches TUI with auto-start)
 *   assets          - Manage development assets and placeholders
 *   ext:firefox     - Launch Firefox with browser extension (launches TUI)
 *   ext:chrome      - Launch Chrome with browser extension (launches TUI)
 *   ext:build       - Build browser extensions for distribution
 */

// Commands that should use the traditional CLI (one-shot commands)
const ONE_SHOT_COMMANDS = ['init', 'build', 'publish', 'setup-ssl', 'ext:build', 'add-dependency', 'extract-config', '--help', '-h', '--version'];

// Commands that should launch TUI with auto-start
const TUI_AUTO_START_COMMANDS = ['dev', 'socket', 'ext:firefox', 'ext:chrome', 'datastore', 'assets'];

const args = process.argv.slice(2);
const command = args[0];

// Check if this is a one-shot command
const isOneShot = ONE_SHOT_COMMANDS.includes(command) ||
                  (command && command.startsWith('-'));

// Check if we should use TUI with auto-start
const isTuiCommand = TUI_AUTO_START_COMMANDS.includes(command);

// If no command or TUI command, try to launch TUI
// Fall back to traditional CLI if TUI dependencies are not available
if (!isOneShot) {
  const fs = require('fs');
  const path = require('path');
  // TUI output is in project root's dist/tui, not bin/dist/tui
  const tuiPath = path.join(__dirname, '..', 'dist', 'tui', 'index.js');

  if (fs.existsSync(tuiPath)) {
    // Use dynamic import() for ESM modules (ink v5 is ESM-only)
    (async () => {
      try {
        const { startTUI } = await import(tuiPath);

        // Determine auto-start commands
        const autoStart = [];
        const tuiArgs = {};

        if (command === 'dev') {
          autoStart.push('dev');
          if (args.includes('--with-socket') || args.includes('-s')) {
            autoStart.push('socket');
          }
          tuiArgs.noHttps = args.includes('--no-https');
        } else if (command === 'socket') {
          autoStart.push('socket');
        } else if (command === 'ext:firefox') {
          autoStart.push('ext firefox');
        } else if (command === 'ext:chrome') {
          autoStart.push('ext chrome');
        }

        startTUI({ autoStart, args: tuiArgs });
      } catch (err) {
        // TUI dependencies not available, fall back to traditional CLI
        console.error('TUI error:', err.message);
        require("./lib/cli");
      }
    })();
  } else {
    // TUI not compiled yet, use traditional CLI
    console.log('Note: TUI not yet available. Run "npm run build:tui" to enable interactive mode.');
    require("./lib/cli");
  }
} else {
  // One-shot command, use traditional CLI
  require("./lib/cli");
}
