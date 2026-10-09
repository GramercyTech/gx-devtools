const fs = require("node:fs")
const path = require("node:path")
const childProcess = require("node:child_process")

function which(command, env = process.env) {
	const extensions =
		process.platform === "win32"
			? (env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";")
			: [""]
	for (const directory of (env.PATH || "")
		.split(path.delimiter)
		.filter(Boolean)) {
		for (const extension of extensions) {
			const candidate = path.join(directory, command + extension)
			try {
				fs.accessSync(
					candidate,
					process.platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK,
				)
				if (fs.statSync(candidate).isFile()) return candidate
			} catch {
				/* Continue searching PATH. */
			}
		}
	}
	return null
}

function npmInvocation(args, env = process.env) {
	const executable = which("npm", env)
	const candidates = [
		env.npm_execpath,
		executable && fs.realpathSync(executable),
		executable &&
			path.join(path.dirname(executable), "node_modules/npm/bin/npm-cli.js"),
		path.join(
			path.dirname(process.execPath),
			"node_modules/npm/bin/npm-cli.js",
		),
	].filter(Boolean)
	const cli = candidates.find(
		(candidate) =>
			path.basename(candidate) === "npm-cli.js" && fs.existsSync(candidate),
	)
	if (!cli)
		throw new Error(
			"Cannot find npm's JavaScript CLI. Install Node.js with npm and retry.",
		)
	return { command: process.execPath, args: [cli, ...args] }
}

function run(command, args, options = {}) {
	const { silent = false, ...settings } = options
	const result = childProcess.spawnSync(command, args, {
		...settings,
		encoding: "utf8",
		stdio: silent ? "pipe" : "inherit",
		shell: false,
	})
	return {
		code: result.status ?? 1,
		stdout: result.stdout || "",
		stderr: result.stderr || result.error?.message || "",
		signal: result.signal,
	}
}

function npm(args, options = {}) {
	const invocation = npmInvocation(args, options.env || process.env)
	return run(invocation.command, invocation.args, options)
}

module.exports = { which, npmInvocation, run, npm }
