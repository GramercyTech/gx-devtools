#!/usr/bin/env node

/**
 * GxToolkit CLI dispatcher.
 *
 * Default mode is the plain CLI. The interactive Terminal UI (TUI) only
 * launches when the user either runs `gxdev ui` or passes `--ui` alongside
 * another command. Running `gxdev` with no command prints the help menu.
 *
 * Launching into the TUI still supports auto-starting well-known long-running
 * commands (dev, socket, ext:chrome, ext:firefox) so that `gxdev dev --ui`
 * boots the TUI with the dev server already running.
 */

const args = process.argv.slice(2)
const command = args[0]

// Kick off a best-effort npm version check on every gxdev invocation. The
// util throttles itself to at most one network hit per 24 hours and stays
// fully non-blocking — if it fails, the CLI is unaffected.
const {
	maybeRunBackgroundCheck,
	registerCliExitReminder,
	getCachedUpdateInfo,
} = require("./lib/utils/version-check")
maybeRunBackgroundCheck()

// TUI activation: bare `ui` command OR any invocation with `--ui`.
const uiFlagPresent = args.includes("--ui")
const isBareUiCommand = command === "ui"
const wantsUi = uiFlagPresent || isBareUiCommand

if (!wantsUi) {
	// Plain CLI path — have the utility print an update reminder on exit
	// (stderr) if the cached info says we're behind.
	registerCliExitReminder()
	require("./lib/cli")
	return
}

// TUI path — locate the compiled TUI bundle and hand off.
const fs = require("fs")
const path = require("path")
const tuiPath = path.join(__dirname, "..", "dist", "tui", "index.js")

if (!fs.existsSync(tuiPath)) {
	console.error("TUI bundle not found.")
	console.error('Run "npm run build:tui" in gx-devtools to compile it.')
	process.exit(1)
}

const isTTY = process.stdout.isTTY && process.stdin.isTTY
if (!isTTY) {
	console.error(
		"The GxP TUI requires an interactive terminal (TTY). Run the plain CLI form without --ui.",
	)
	process.exit(1)
}

// Work out which TUI services to auto-start from the command that was paired
// with --ui. `gxdev ui` on its own launches the TUI idle.
const autoStart = []
const tuiArgs = {}

switch (isBareUiCommand ? null : command) {
	case "dev":
		autoStart.push("dev")
		if (args.includes("--with-socket") || args.includes("-s")) {
			autoStart.push("socket")
		}
		tuiArgs.noHttps = args.includes("--no-https")
		break
	case "socket":
		autoStart.push("socket")
		break
	case "ext:firefox":
		autoStart.push("ext firefox")
		break
	case "ext:chrome":
		autoStart.push("ext chrome")
		break
	default:
		// No known auto-start for this command (or no command) — launch idle.
		break
}

;(async () => {
	try {
		const { startTUI } = await import(tuiPath)
		const updateInfo = getCachedUpdateInfo()
		startTUI({ autoStart, args: tuiArgs, updateInfo })
	} catch (err) {
		if (err && err.message === "NO_TTY") {
			console.error("The GxP TUI requires an interactive terminal (TTY).")
			process.exit(1)
		}
		console.error(
			"Failed to start TUI:",
			err && err.message ? err.message : err,
		)
		process.exit(1)
	}
})()
