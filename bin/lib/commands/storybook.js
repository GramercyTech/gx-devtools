/**
 * Storybook Command
 *
 * Runs the @gxp-dev/app-ui Storybook instance from the plugin project. app-ui
 * ships its own storybook config + @storybook/addon-mcp but declares the
 * storybook ecosystem as *optional* peerDependencies, so plugin projects stay
 * lean by default. This command resolves the installed app-ui, detects any
 * missing storybook peers, prompts to install them in the plugin project's
 * node_modules, then delegates to the app-ui's storybook script.
 *
 * When `storybook dev` is running, the addon-mcp also exposes an HTTP MCP
 * server at http://localhost:6006/mcp — the template's mcp.json registers it
 * as a second MCP server alongside the toolkit's stdio one.
 */

const path = require("path")
const fs = require("fs")
const shell = require("shelljs")
const readline = require("readline")
const { findProjectRoot } = require("../utils")
const { resolveAppUi } = require("../utils/app-ui")

const STORYBOOK_PEERS = [
	"storybook",
	"@storybook/vue3-vite",
	"@storybook/addon-mcp",
	"@storybook/addon-a11y",
	"@storybook/addon-themes",
]

function isInstalled(pkgName, fromDir) {
	let dir = path.resolve(fromDir)
	while (dir) {
		const candidate = path.join(dir, "node_modules", pkgName, "package.json")
		if (fs.existsSync(candidate)) return true
		const parent = path.dirname(dir)
		if (parent === dir) break
		dir = parent
	}
	return false
}

function findMissingPeers(appUiRoot, pkg) {
	const peerSpecs = (pkg && pkg.peerDependencies) || {}
	return STORYBOOK_PEERS.filter((name) => {
		if (!peerSpecs[name]) return false
		return !isInstalled(name, appUiRoot)
	}).map((name) => `${name}@${peerSpecs[name]}`)
}

async function confirm(question) {
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		})
		rl.question(`${question} (Y/n) `, (answer) => {
			rl.close()
			const trimmed = (answer || "").trim().toLowerCase()
			resolve(trimmed === "" || trimmed === "y" || trimmed === "yes")
		})
	})
}

async function storybookCommand(argv) {
	const resolved = resolveAppUi(process.cwd())
	if (!resolved) {
		console.error(
			"❌ Could not find @gxp-dev/app-ui in this project's node_modules.",
		)
		console.log("💡 Install it with: npm install @gxp-dev/app-ui")
		process.exit(1)
	}

	const { root: appUiRoot, pkg } = resolved
	const wantsBuild = Boolean(argv.build)
	const scriptName = wantsBuild ? "storybook:build" : "storybook"
	const script = pkg.scripts && pkg.scripts[scriptName]
	const storybookConfig = path.join(appUiRoot, ".storybook")

	if (!script || !fs.existsSync(storybookConfig)) {
		console.error(
			`❌ @gxp-dev/app-ui@${pkg.version || "?"} at ${appUiRoot} does not ship a Storybook setup.`,
		)
		console.log(
			"💡 Upgrade app-ui to a version whose `files` field includes `.storybook` and `src`.",
		)
		process.exit(1)
	}

	const missing = findMissingPeers(appUiRoot, pkg)
	if (missing.length > 0) {
		console.log("📦 Storybook tooling is not installed yet.")
		console.log("   app-ui lists these as optional peerDependencies:")
		for (const spec of missing) {
			console.log(`   • ${spec}`)
		}
		const proceed = await confirm(
			"   Install them now in this project (npm install --save-dev)?",
		)
		if (!proceed) {
			console.log(
				"⏭  Skipped. Install manually and re-run: npm install --save-dev " +
					missing.join(" "),
			)
			process.exit(1)
		}

		const projectRoot = findProjectRoot()
		const installCmd = `npm install --save-dev --no-fund --no-audit ${missing.map((m) => `"${m}"`).join(" ")}`
		console.log(`▶ ${installCmd}`)
		const installResult = shell.exec(installCmd, { cwd: projectRoot })
		if (installResult.code !== 0) {
			console.error("❌ Install failed. Resolve the errors and try again.")
			process.exit(installResult.code)
		}
	}

	const label = wantsBuild
		? "📚 Building Storybook from @gxp-dev/app-ui..."
		: "📚 Starting Storybook from @gxp-dev/app-ui (http://localhost:6006)"
	console.log(label)
	console.log(`📁 AppUI path: ${appUiRoot}`)

	const result = shell.exec(`npm run ${scriptName}`, { cwd: appUiRoot })
	if (result.code !== 0) {
		process.exit(result.code)
	}
}

module.exports = { storybookCommand }
