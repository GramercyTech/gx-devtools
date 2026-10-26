const fs = require("node:fs")
const { createRequire } = require("node:module")

const MESSAGE =
	"Patched MCP validation runtime required. Upgrade this project's Zod to a supported stable 4.x release (4.6.7 or later) and reinstall dependencies."
const MAX_PACKAGE_BYTES = 32768

function migrationError() {
	const error = new Error(MESSAGE)
	// Existing entry points log stack; migration diagnostics must not disclose paths.
	error.stack = MESSAGE
	return error
}

function assertSupportedZodVersion(version) {
	if (
		typeof version !== "string" ||
		version.length > 64 ||
		!/^4\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)
	)
		throw migrationError()
	const [, minor, patch] = version.split(".").map(Number)
	if (
		!Number.isSafeInteger(minor) ||
		!Number.isSafeInteger(patch) ||
		minor < 6 ||
		(minor === 6 && patch < 7)
	)
		throw migrationError()
}

/** Resolve the peer relative to the actual SDK, never the toolkit or project root. */
function assertMcpValidationRuntime(sdkEntry) {
	let descriptor
	try {
		const entry =
			sdkEntry === undefined
				? require.resolve("@modelcontextprotocol/sdk/server/index.js")
				: sdkEntry
		const packagePath = createRequire(entry).resolve("zod/package.json")
		descriptor = fs.openSync(
			packagePath,
			fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
		)
		const before = fs.fstatSync(descriptor)
		if (!before.isFile() || before.size < 1 || before.size > MAX_PACKAGE_BYTES)
			throw new Error()
		const buffer = Buffer.alloc(MAX_PACKAGE_BYTES + 1)
		const length = fs.readSync(descriptor, buffer, 0, buffer.length, 0)
		const after = fs.fstatSync(descriptor)
		if (
			length !== before.size ||
			before.size !== after.size ||
			before.mtimeMs !== after.mtimeMs ||
			before.ctimeMs !== after.ctimeMs
		)
			throw new Error()
		assertSupportedZodVersion(
			JSON.parse(buffer.subarray(0, length).toString("utf8")).version,
		)
	} catch {
		throw migrationError()
	} finally {
		if (descriptor !== undefined) fs.closeSync(descriptor)
	}
}

module.exports = { assertMcpValidationRuntime, assertSupportedZodVersion }
