#!/usr/bin/env node

/**
 * Deprecated bin. Forwards to the same stdio MCP server as `mcp-serve`,
 * but prints a one-time stderr notice on startup so existing scaffolded
 * projects keep working while users migrate their MCP configs to the new
 * name. This shim will be removed in a future major release.
 *
 * Migration:
 *   - claude:  `claude mcp add gxp-api mcp-serve`
 *   - codex:   `codex mcp add gxp-api mcp-serve`
 *   - gemini:  set "command": "mcp-serve" in ~/.gemini/settings.json
 *   - .mcp.json / .gemini/settings.json:  swap "gxp-api-server" -> "mcp-serve"
 *
 * The notice is written to stderr (not stdout) so it doesn't corrupt the
 * MCP JSON-RPC stream the client is reading.
 */

process.stderr.write(
	"[gxp-api-server] DEPRECATED: this bin name will be removed in a future major release. Use `mcp-serve` instead — update your .mcp.json / .gemini/settings.json or rerun `claude mcp add gxp-api mcp-serve`.\n",
)

const { startServer } = require("./lib/server")

startServer().catch((err) => {
	console.error(err && err.stack ? err.stack : err)
	process.exit(1)
})
