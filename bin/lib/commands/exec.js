/**
 * Exec Command
 *
 * Runs a tool binary (prettier, eslint, etc.) resolved from one of:
 *   1. <project>/node_modules/.bin/<tool>
 *   2. <@gxp-dev/tools install>/node_modules/.bin/<tool>
 *   3. The current PATH
 *
 * Designed for the pre-commit hook so that `gxdev exec prettier ...` and
 * `gxdev exec eslint ...` work whether the toolkit is installed locally
 * or globally — the hook doesn't need to know where the binary lives.
 */

const path = require("path")
const fs = require("fs")
const childProcess = require("child_process")
// Access via the `paths` module (rather than destructuring at require time)
// so vi.spyOn(paths, ...) in tests actually intercepts these calls.
const paths = require("../utils/paths")
const { isWin } = require("../constants")

// Module-private spawn reference so tests can swap in a stub via
// `setSpawnForTesting`. Production code paths still call the real
// `child_process.spawn` because the default closes over it.
let _spawn = childProcess.spawn
function setSpawnForTesting(fn) {
	_spawn = fn || childProcess.spawn
}

function binFileName(tool) {
	return isWin ? `${tool}.cmd` : tool
}

/**
 * Walk the candidate locations and return the first existing binary path,
 * or `null` to defer to PATH lookup.
 */
function resolveBinary(tool) {
	const fileName = binFileName(tool)

	const projectBin = path.join(
		paths.findProjectRoot(),
		"node_modules",
		".bin",
		fileName,
	)
	if (fs.existsSync(projectBin)) {
		return projectBin
	}

	const toolkitBin = path.join(
		paths.resolveGxPaths().packageRoot,
		"node_modules",
		".bin",
		fileName,
	)
	if (fs.existsSync(toolkitBin)) {
		return toolkitBin
	}

	return null
}

async function execCommand(argv) {
	const positional = Array.isArray(argv._) ? argv._.slice(1) : []
	const tool = argv.tool || positional[0]

	if (!tool) {
		console.error(
			"Usage: gxdev exec <tool> [args...]\n\n" +
				"Resolves <tool> from the local node_modules/.bin, then the toolkit's\n" +
				"own node_modules/.bin, then PATH, and runs it with the remaining args.",
		)
		process.exit(2)
		return
	}

	// Everything after `exec <tool>` on the original command line should be
	// forwarded to the tool verbatim. yargs parses flags it recognises, so we
	// reconstruct the forwarded args from process.argv to preserve `--write`,
	// `--no-warn-ignored`, etc. exactly as the user wrote them.
	const execIdx = process.argv.indexOf("exec")
	const toolArgs =
		execIdx !== -1 ? process.argv.slice(execIdx + 2) : positional.slice(1)

	// Route through module.exports so tests can spy on resolveBinary.
	const resolved = module.exports.resolveBinary(tool)
	const target = resolved || tool

	const child = _spawn(target, toolArgs, {
		stdio: "inherit",
		// shell: true lets PATH lookup happen when `resolved` is null, and on
		// Windows handles the .cmd shim. When we already have an absolute path
		// the shell adds no behavior change.
		shell: !resolved || isWin,
	})

	child.on("error", (err) => {
		if (err.code === "ENOENT") {
			console.error(
				`gxdev exec: could not find "${tool}". Tried:\n` +
					`  - ${path.join(paths.findProjectRoot(), "node_modules", ".bin", binFileName(tool))}\n` +
					`  - ${path.join(paths.resolveGxPaths().packageRoot, "node_modules", ".bin", binFileName(tool))}\n` +
					`  - $PATH`,
			)
			process.exit(127)
		}
		console.error(`gxdev exec: failed to launch "${tool}":`, err.message)
		process.exit(1)
	})

	child.on("exit", (code, signal) => {
		if (signal) {
			process.kill(process.pid, signal)
			return
		}
		process.exit(code ?? 0)
	})
}

module.exports = {
	execCommand,
	resolveBinary,
	setSpawnForTesting,
}
