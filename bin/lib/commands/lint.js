/**
 * Lint Command
 *
 * Validates GxP config JSON (configuration.json, app-manifest.json) against
 * schemas derived from the templating system docs.
 */

const path = require("path")
const fs = require("fs")
const { lintFiles, detectSchema } = require("../lint")
const { formatReport } = require("../lint/formatter")
const { findProjectRoot } = require("../utils")

/**
 * Targets for `--all` mode. Extendable as more lintable files emerge.
 */
const DEFAULT_TARGETS = ["configuration.json", "app-manifest.json"]

function collectAllTargets(projectPath) {
	return DEFAULT_TARGETS.map((name) => path.join(projectPath, name)).filter(
		(p) => fs.existsSync(p),
	)
}

async function lintCommand(argv) {
	const projectPath = findProjectRoot()
	const explicit = Array.isArray(argv.files) ? argv.files.filter(Boolean) : []

	let files
	let userSuppliedFiles = false
	if (explicit.length > 0) {
		// Resolve relative to the cwd the user ran from.
		files = explicit.map((f) => path.resolve(process.cwd(), f))
		userSuppliedFiles = true
	} else {
		// No files given: default to the well-known targets in the project root.
		files = collectAllTargets(projectPath)
	}

	if (files.length === 0) {
		console.log(
			"No configuration.json or app-manifest.json found in project root.",
		)
		return
	}

	// Drop files we don't have a schema for, unless the user named them
	// explicitly — in that case surface them as skipped in the report.
	if (!userSuppliedFiles) {
		files = files.filter((f) => detectSchema(f))
	}

	const { results, summary } = lintFiles(files)

	if (argv.json) {
		const out = {
			summary,
			results: results.map((r) => ({
				file: r.file,
				ok: r.ok,
				skipped: r.skipped,
				errors: r.errors,
			})),
		}
		console.log(JSON.stringify(out, null, 2))
	} else {
		console.log(formatReport({ results, summary }, { cwd: projectPath }))
	}

	if (summary.filesWithErrors > 0) {
		process.exit(1)
	}
}

module.exports = {
	lintCommand,
}
