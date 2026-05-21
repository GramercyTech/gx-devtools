/**
 * Test Command
 *
 * Thin wrapper around vitest that works whether @gxp-dev/tools is installed
 * locally or globally.
 *
 * Resolution:
 *   1. Use the project's vitest binary if it exists (fast path, no NODE_PATH
 *      override needed — happy-dom and @vue/test-utils resolve naturally).
 *   2. Otherwise, use the toolkit's bundled vitest. Set NODE_PATH to the
 *      toolkit's node_modules so vitest can find happy-dom and friends even
 *      though it's being invoked against a project tree without them.
 *
 * Default args: `vitest run --passWithNoTests`. Pass `--watch` to switch to
 * watch mode. All other args are forwarded verbatim.
 */

const path = require("path")
const fs = require("fs")
const childProcess = require("child_process")
// Access via the `paths` module (rather than destructuring at require time)
// so vi.spyOn(paths, ...) in tests actually intercepts these calls.
const paths = require("../utils/paths")
const { isWin } = require("../constants")

// Module-private spawn reference so tests can swap in a stub.
let _spawn = childProcess.spawn
function setSpawnForTesting(fn) {
	_spawn = fn || childProcess.spawn
}

function binFileName(tool) {
	return isWin ? `${tool}.cmd` : tool
}

/**
 * Returns { binary, fromToolkit } where binary is the vitest path to spawn
 * and fromToolkit indicates whether we need NODE_PATH set so the test
 * environment resolves correctly.
 */
function resolveVitest() {
	const fileName = binFileName("vitest")

	const projectBin = path.join(
		paths.findProjectRoot(),
		"node_modules",
		".bin",
		fileName,
	)
	if (fs.existsSync(projectBin)) {
		return { binary: projectBin, fromToolkit: false }
	}

	const toolkitBin = path.join(
		paths.resolveGxPaths().packageRoot,
		"node_modules",
		".bin",
		fileName,
	)
	if (fs.existsSync(toolkitBin)) {
		return { binary: toolkitBin, fromToolkit: true }
	}

	return { binary: null, fromToolkit: false }
}

async function testCommand(_argv) {
	// Route through module.exports so tests can spy on resolveVitest.
	const { binary, fromToolkit } = module.exports.resolveVitest()

	if (!binary) {
		console.error(
			"gxdev test: could not find vitest. Install @gxp-dev/tools globally or run `npm install` in your project.",
		)
		process.exit(127)
		return
	}

	// Reconstruct the args after `test` so flags like --filter, --reporter,
	// and positional file paths reach vitest unchanged.
	const testIdx = process.argv.indexOf("test")
	const rawArgs = testIdx !== -1 ? process.argv.slice(testIdx + 1) : []

	// Default to a one-shot CI-style run. Watch mode is opt-in via --watch.
	const watch = rawArgs.includes("--watch")
	const vitestArgs = watch
		? rawArgs.filter((a) => a !== "--watch")
		: ["run", "--passWithNoTests", ...rawArgs]

	const env = { ...process.env }
	if (fromToolkit) {
		// Prepend the toolkit's node_modules to NODE_PATH so vitest can
		// resolve happy-dom / @vue/test-utils even though it's running against
		// a project that doesn't have them installed locally.
		const toolkitModules = path.join(
			paths.resolveGxPaths().packageRoot,
			"node_modules",
		)
		env.NODE_PATH = env.NODE_PATH
			? `${toolkitModules}${path.delimiter}${env.NODE_PATH}`
			: toolkitModules
	}

	const child = _spawn(binary, vitestArgs, {
		stdio: "inherit",
		cwd: paths.findProjectRoot(),
		env,
		shell: isWin,
	})

	child.on("error", (err) => {
		console.error("gxdev test: failed to launch vitest:", err.message)
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
	testCommand,
	resolveVitest,
	setSpawnForTesting,
}
