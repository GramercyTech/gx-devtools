// Test-only preloader: replace unpublished candidates in this disposable fixture
// immediately before the real CLI's first npm install. Never loaded by gxdev.
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const commands = require("../../bin/lib/utils/process")
const config = JSON.parse(
	fs.readFileSync(process.env.GXDEV_E2E_INSTALL_CONFIG, "utf8"),
)
const original = commands.npm
let substituted = false
commands.npm = (args, options = {}) => {
	if (!substituted && args[0] === "install") {
		assert.equal(path.resolve(options.cwd), path.resolve(config.project))
		const manifestPath = path.join(config.project, "package.json")
		const pkg = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
		assert.equal(pkg.dependencies["@gxp-dev/app-ui"], "^0.2.0")
		assert.equal(pkg.devDependencies["@gxp-dev/tools"], "^2.1.43")
		const requested = {
			appui: pkg.dependencies["@gxp-dev/app-ui"],
			toolkit: pkg.devDependencies["@gxp-dev/tools"],
		}
		for (const [name, archive] of Object.entries(config.archives)) {
			const digest = crypto
				.createHash("sha256")
				.update(fs.readFileSync(archive.path))
				.digest("hex")
			assert.equal(digest, archive.sha256)
			const target =
				name === "@gxp-dev/tools" ? pkg.devDependencies : pkg.dependencies
			target[name] = `file:${archive.path}`
		}
		fs.writeFileSync(manifestPath, JSON.stringify(pkg, null, 2))
		fs.writeFileSync(
			config.receipt,
			JSON.stringify({
				requested,
				substituted: Object.keys(config.archives),
				realNpmInstall: true,
				archiveSha256: Object.fromEntries(
					Object.entries(config.archives).map(([name, archive]) => [
						name,
						archive.sha256,
					]),
				),
			}),
		)
		substituted = true
	}
	return original(args, options)
}
