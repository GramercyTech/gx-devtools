/**
 * Publish Command
 *
 * Copies package files to local project for customization.
 */

const path = require("path")
const fs = require("fs")
const {
	findProjectRoot,
	resolveGxPaths,
	promptUser,
	safeCopyFile,
} = require("../utils")

/**
 * Publish command - copies package files to local project
 */
async function publishCommand(argv) {
	const projectPath = findProjectRoot()
	const paths = resolveGxPaths()

	const fileName = argv.file || argv._[1] // Support both --file and positional argument

	if (!fileName) {
		console.log("📦 Available files to publish:")
		console.log("")
		console.log("  Development files (customize dev environment):")
		console.log("  • main.js            - Development entry point")
		console.log("  • index.html         - HTML template")
		console.log("")
		console.log("  Runtime files (advanced customization):")
		console.log("  • server.cjs         - Socket.IO server file")
		console.log("  • gxpPortalConfigStore.js - GxP datastore")
		console.log("")
		console.log("💡 Usage:")
		console.log("  gxdev publish main.js")
		console.log("  gxdev publish server.cjs")
		console.log("")
		console.log("💡 To customize the Vite config, create vite.extend.js at")
		console.log(
			"   the project root — it will be merged into the runtime config.",
		)
		return
	}

	const publishableFiles = {
		"main.js": {
			src: "main.js",
			dest: "main.js",
			desc: "Development entry point",
			location: "runtime",
		},
		"index.html": {
			src: "index.html",
			dest: "index.html",
			desc: "HTML template",
			location: "runtime",
		},
		"server.cjs": {
			src: "server.cjs",
			dest: "server.cjs",
			desc: "Socket.IO server file",
			location: "runtime",
		},
		"gxpPortalConfigStore.js": {
			src: "stores/gxpPortalConfigStore.js",
			dest: "src/stores/gxpPortalConfigStore.js",
			desc: "GxP datastore",
			location: "runtime",
		},
	}

	const fileConfig = publishableFiles[fileName]
	if (!fileConfig) {
		console.error(`❌ Unknown file: ${fileName}`)
		console.log("📦 Available files:", Object.keys(publishableFiles).join(", "))
		process.exit(1)
	}

	// Get source path from appropriate directory
	const sourceDir =
		fileConfig.location === "runtime" ? paths.runtimeDir : paths.templateDir
	const srcPath = path.join(sourceDir, fileConfig.src)
	const destPath = path.join(projectPath, fileConfig.dest)

	if (!fs.existsSync(srcPath)) {
		console.error(`❌ Source file not found: ${srcPath}`)
		process.exit(1)
	}

	// Check if local file already exists
	if (fs.existsSync(destPath)) {
		const overwrite = await promptUser(
			`📁 ${fileConfig.dest} already exists. Overwrite? (y/N): `,
		)
		if (overwrite.toLowerCase() !== "y" && overwrite.toLowerCase() !== "yes") {
			console.log("📦 Publish cancelled")
			return
		}
	}

	// Ensure destination directory exists
	const destDir = path.dirname(destPath)
	if (!fs.existsSync(destDir)) {
		fs.mkdirSync(destDir, { recursive: true })
	}

	// Copy the file
	fs.copyFileSync(srcPath, destPath)
	console.log(`Creating ${fileConfig.desc}`)
	console.log(`✅ Published ${fileName} to project`)
	console.log(`📁 Local file: ${fileConfig.dest}`)

	// Special handling for index.html - update main.js reference to local path
	if (fileName === "index.html") {
		try {
			let content = fs.readFileSync(destPath, "utf-8")
			// Update the runtime reference to local reference
			if (content.includes('src="/@gx-runtime/main.js"')) {
				content = content.replace(
					'src="/@gx-runtime/main.js"',
					'src="/main.js"',
				)
				fs.writeFileSync(destPath, content)
				console.log("📝 Updated index.html to reference local main.js")
				console.log(
					"💡 Make sure to also publish main.js: gxdev publish main.js",
				)
			}
		} catch (error) {
			console.warn("⚠️ Could not update index.html:", error.message)
		}
	}

	// Special handling for gxpPortalConfigStore.js - update the import in stores/index.js
	if (fileName === "gxpPortalConfigStore.js") {
		const storeIndexPath = path.join(projectPath, "src/stores/index.js")
		if (fs.existsSync(storeIndexPath)) {
			try {
				let content = fs.readFileSync(storeIndexPath, "utf-8")
				// Match both old (config) and new (runtime) import paths
				const oldImportPatterns = [
					"import { useGxpStore } from '@gxp-dev/tools/config/stores/gxpPortalConfigStore.js';",
					"import { useGxpStore } from '@gxp-dev/tools/config/stores/gxpPortalConfigStore';",
					"import { useGxpStore } from '@gxp-dev/tools/runtime/stores/gxpPortalConfigStore.js';",
					"import { useGxpStore } from '@gxp-dev/tools/runtime/stores/gxpPortalConfigStore';",
					'import { useGxpStore } from "@gxp-dev/tools/runtime/stores/gxpPortalConfigStore";',
				]
				const newImport =
					"import { useGxpStore } from './gxpPortalConfigStore.js';"

				let updated = false
				for (const oldImport of oldImportPatterns) {
					if (content.includes(oldImport)) {
						content = content.replace(oldImport, newImport)
						updated = true
						break
					}
				}

				if (updated) {
					fs.writeFileSync(storeIndexPath, content)
					console.log(
						"📝 Updated stores/index.js to use local gxpPortalConfigStore.js",
					)
				}
			} catch (error) {
				console.warn(
					"⚠️ Could not update stores/index.js import:",
					error.message,
				)
			}
		}
	}

	console.log("💡 Future gxdev commands will now use your local copy")
	console.log("   Delete the local file to fall back to package version")
}

module.exports = {
	publishCommand,
}
