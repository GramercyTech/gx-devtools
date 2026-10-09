#!/usr/bin/env node
/** Firefox tooling is an explicit local installation, excluded from app runtimes. */
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { pathToFileURL } = require("node:url")
const VERSION = "10.7.0"

function resolveWebExt(env = process.env) {
	const root = path.resolve(
		env.GXP_BROWSER_TOOLS_DIR ||
			path.join(os.homedir(), ".gxp", "browser-tools"),
	)
	const packageRoot = path.join(root, "node_modules", "web-ext")
	let manifest
	try {
		manifest = JSON.parse(
			fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
		)
	} catch {
		throw new Error(
			`Firefox tooling is not installed. Install it explicitly with: npm install --prefix ${JSON.stringify(root)} --save-exact web-ext@${VERSION}`,
		)
	}
	if (manifest.name !== "web-ext" || manifest.version !== VERSION) {
		throw new Error(
			`Firefox tooling requires web-ext@${VERSION} in ${root}; found ${manifest.version || "unknown"}.`,
		)
	}
	const entry = path.resolve(packageRoot, manifest.bin?.["web-ext"] || "")
	const relative = path.relative(packageRoot, entry)
	if (
		!relative ||
		relative.startsWith("..") ||
		path.isAbsolute(relative) ||
		!fs.statSync(entry).isFile()
	) {
		throw new Error("Invalid local web-ext executable")
	}
	return entry
}

if (require.main === module) {
	Promise.resolve()
		.then(() => import(pathToFileURL(resolveWebExt()).href))
		.catch((error) => {
			console.error(error.message)
			process.exitCode = 1
		})
}
module.exports = { resolveWebExt, VERSION }
