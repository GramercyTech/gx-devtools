#!/usr/bin/env node

/**
 * GxP MCP Server (stdio).
 *
 * Primary bin: `mcp-serve`.
 *
 * Speaks Model Context Protocol over stdin/stdout using the official
 * @modelcontextprotocol/sdk's StdioServerTransport. The full tool surface
 * and wiring live in ./lib/server.js so this file stays a thin entry point.
 *
 * Usage:
 *   mcp-serve
 *   node mcp/mcp-serve.js
 *
 * Configure in your AI tool's MCP settings to enable API-aware,
 * schema-aware, test-aware assistance inside plugin projects.
 */

const { startServer } = require("./lib/server")

startServer().catch((err) => {
	console.error(err && err.stack ? err.stack : err)
	process.exit(1)
})
