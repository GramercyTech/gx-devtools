#!/usr/bin/env node
import React from "react"
import { render } from "ink"
import dotenv from "dotenv"
import path from "path"
import App from "./App.js"
import { serviceManager } from "./services/index.js"

// Load .env from the current working directory (project directory)
dotenv.config({ path: path.join(process.cwd(), ".env") })

export interface UpdateInfo {
	currentVersion: string
	latestVersion: string | null
	updateAvailable: boolean
	lastCheckedAt: number | null
}

interface TUIOptions {
	autoStart?: string[] // Commands to auto-start (e.g., ['dev', 'socket'])
	args?: Record<string, unknown> // Command arguments
	updateInfo?: UpdateInfo | null // Cached npm version-check result (for landing page banner)
}

export function startTUI(options: TUIOptions = {}) {
	// Check if stdin supports raw mode (required for Ink input handling)
	// This can fail when:
	// - Running in CI environments
	// - Piped input (stdin is not a TTY)
	// - Some terminal emulators
	const stdin = process.stdin
	const stdinIsTTY = stdin.isTTY === true

	// If stdin doesn't support raw mode, we need to handle it gracefully
	// Ink 5.x uses stdin by default and requires raw mode for input
	if (!stdinIsTTY) {
		throw new Error("NO_TTY")
	}

	const { waitUntilExit } = render(
		<App
			autoStart={options.autoStart}
			args={options.args}
			updateInfo={options.updateInfo}
		/>,
	)

	waitUntilExit().then(() => {
		// Ensure all services are stopped before exiting
		serviceManager.forceStopAll()
		process.exit(0)
	})
}

// Check if run directly (ESM way)
import { fileURLToPath } from "url"
const isMain =
	process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
	startTUI()
}

export default startTUI
