/**
 * Terminal output formatter for GxP linter results.
 *
 * Uses raw ANSI codes (no extra dep). Auto-disables color when stdout is not
 * a TTY or when NO_COLOR is set.
 */

const path = require("path")

const USE_COLOR = process.stdout.isTTY && !process.env.NO_COLOR

function wrap(code) {
	return (str) => (USE_COLOR ? `\x1b[${code}m${str}\x1b[0m` : String(str))
}

const red = wrap("31")
const green = wrap("32")
const yellow = wrap("33")
const blue = wrap("34")
const magenta = wrap("35")
const cyan = wrap("36")
const gray = wrap("90")
const bold = wrap("1")
const dim = wrap("2")

function formatResult(result, { cwd = process.cwd() } = {}) {
	const lines = []
	const rel = path.relative(cwd, result.file) || result.file

	if (result.skipped) {
		lines.push(gray(`  ${rel} — skipped (${result.reason || "no schema"})`))
		return lines.join("\n")
	}

	if (result.ok) {
		lines.push(`  ${green("✓")} ${rel}`)
		return lines.join("\n")
	}

	lines.push(`  ${red("✗")} ${bold(rel)}`)
	for (const err of result.errors) {
		const loc = gray(`${result.file}:${err.line}:${err.column}`)
		const code = dim(`[${err.code}]`)
		lines.push(`    ${red("error")} ${code} ${err.message}`)
		lines.push(`       ${loc}`)
	}
	return lines.join("\n")
}

function formatReport({ results, summary }, opts = {}) {
	const lines = []
	lines.push(bold(cyan("\nGxP config lint")))
	lines.push(
		gray(`  ${summary.totalFiles} file(s) scanned, ${summary.skipped} skipped`),
	)
	lines.push("")

	for (const r of results) {
		lines.push(formatResult(r, opts))
	}

	lines.push("")
	if (summary.totalErrors === 0 && summary.filesWithErrors === 0) {
		lines.push(green(bold("✓ No problems found.")))
	} else {
		lines.push(
			red(
				bold(
					`✗ ${summary.totalErrors} error(s) in ${summary.filesWithErrors} file(s).`,
				),
			),
		)
	}
	return lines.join("\n")
}

module.exports = {
	formatResult,
	formatReport,
	colors: {
		red,
		green,
		yellow,
		blue,
		magenta,
		cyan,
		gray,
		bold,
		dim,
	},
}
