import { describe, expect, it } from "vitest"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const root = process.env.GXDEV_PACKED_CONSUMER_ROOT

describe.skipIf(!root)("actual npm12 packed-consumer MCP resolution", () => {
	for (const mode of ["fresh", "legacy"]) {
		it(`serializes schemas and preserves concurrent trusted target scopes in ${mode}`, async () => {
			const consumer = createRequire(path.join(root, mode, "package.json"))
			const packagePath = consumer.resolve("@gxp-dev/tools/package.json")
			const toolkit = createRequire(packagePath)
			const mcpPath = toolkit.resolve("@modelcontextprotocol/sdk/server/mcp.js")
			const sdk = createRequire(mcpPath)
			const resolvedZod = sdk.resolve("zod/package.json")
			const version = JSON.parse(fs.readFileSync(resolvedZod, "utf8")).version
			const toolkitZod = JSON.parse(
				fs.readFileSync(toolkit.resolve("zod/package.json"), "utf8"),
			).version
			expect(toolkitZod).toBe("4.6.7")
			if (mode === "fresh") expect(version).toBe("4.6.7")
			else expect(consumer("zod/package.json").version).toBe("3.25.76")
			const { z } = sdk("zod")
			const { McpServer } = toolkit("@modelcontextprotocol/sdk/server/mcp.js")
			const { Client } = toolkit("@modelcontextprotocol/sdk/client/index.js")
			const { InMemoryTransport } = toolkit(
				"@modelcontextprotocol/sdk/inMemory.js",
			)
			const api = toolkit(
				path.join(path.dirname(packagePath), "mcp/lib/server.js"),
			)
			const server = new McpServer({
				name: "synthetic-target-server",
				version: "1.0.0",
			})
			const client = new Client({
				name: "synthetic-target-client",
				version: "1.0.0",
			})
			const requests = []
			const originalFetch = global.fetch
			global.fetch = async (url) => {
				expect([
					"https://primary.catalog.example.test/api-specs/openapi.json",
					"https://secondary.catalog.example.test/api-specs/openapi.json",
				]).toContain(url)
				requests.push(url)
				await Promise.resolve()
				return {
					ok: true,
					json: async () => ({
						paths: { "/example": { get: { operationId: url } } },
					}),
				}
			}
			for (const [name, environment, origin] of [
				["primary", "develop", "primary"],
				["secondary", "testing", "secondary"],
			]) {
				server.registerTool(
					name,
					{ inputSchema: { value: z.string().min(1) } },
					async ({ value }) =>
						api.withSpecContext(
							{
								environment,
								specOrigin: `https://${origin}.catalog.example.test`,
							},
							async () => {
								const response = await api.handleToolCall(
									"api_list_operation_ids",
									{},
								)
								const env = await api.handleToolCall("get_api_environment", {})
								return {
									content: [
										{
											type: "text",
											text: JSON.stringify({
												value,
												environment: JSON.parse(env.content[0].text)
													.environment,
												operations: JSON.parse(response.content[0].text)
													.operations,
											}),
										},
									],
								}
							},
						),
				)
			}
			const [a, b] = InMemoryTransport.createLinkedPair()
			try {
				await server.connect(a)
				await client.connect(b)
				const responses = await Promise.all([
					client.callTool({ name: "primary", arguments: { value: "one" } }),
					client.callTool({ name: "secondary", arguments: { value: "two" } }),
				])
				const results = responses.map((response) =>
					JSON.parse(response.content[0].text),
				)
				expect(results.map((r) => r.environment)).toEqual([
					"develop",
					"testing",
				])
				expect(results.map((r) => r.value)).toEqual(["one", "two"])
				expect(results[0].operations[0].operationId).toContain(
					"primary.catalog.example.test",
				)
				expect(results[1].operations[0].operationId).toContain(
					"secondary.catalog.example.test",
				)
				expect(requests).toHaveLength(2)
				const invalid = await client.callTool({
					name: "primary",
					arguments: { value: 42 },
				})
				expect(invalid.isError).toBe(true)
				console.log(
					JSON.stringify({
						consumer: mode,
						sdkZodVersion: version,
						toolkitZodVersion: toolkitZod,
						concurrentTargetScopeVerified: true,
						schemaValidationVerified: true,
					}),
				)
			} finally {
				global.fetch = originalFetch
				await client.close()
				await server.close()
			}
		})
		it(`enforces the validation runtime before actual stdio handshake in ${mode}`, async () => {
			const consumer = createRequire(path.join(root, mode, "package.json"))
			const packagePath = consumer.resolve("@gxp-dev/tools/package.json")
			const toolkit = createRequire(packagePath)
			const entry = path.join(path.dirname(packagePath), "mcp/mcp-serve.js")
			if (mode === "legacy") {
				const response = spawnSync(process.execPath, [entry], {
					cwd: path.join(root, mode),
					env: { PATH: process.env.PATH },
					encoding: "utf8",
					input:
						JSON.stringify({
							jsonrpc: "2.0",
							id: 1,
							method: "initialize",
							params: {
								protocolVersion: "2025-03-26",
								capabilities: {},
								clientInfo: {
									name: "synthetic-denied-client",
									version: "1.0.0",
								},
							},
						}) + "\n",
					timeout: 5000,
				})
				expect(response.status).toBe(1)
				expect(response.stdout).toBe("")
				expect(response.stderr.trim()).toBe(
					"Patched MCP validation runtime required. Upgrade this project's Zod to a supported stable 4.x release (4.6.7 or later) and reinstall dependencies.",
				)
				expect(response.stderr).not.toContain(root)
				return
			}
			const { Client } = toolkit("@modelcontextprotocol/sdk/client/index.js")
			const { StdioClientTransport } = toolkit(
				"@modelcontextprotocol/sdk/client/stdio.js",
			)
			const client = new Client({
				name: "synthetic-stdio-client",
				version: "1.0.0",
			})
			const transport = new StdioClientTransport({
				command: process.execPath,
				args: [entry],
				cwd: path.join(root, mode),
				env: { PATH: process.env.PATH },
				stderr: "pipe",
			})
			try {
				await client.connect(transport)
				const catalog = await client.listTools()
				expect(
					catalog.tools.some((tool) => tool.name === "get_api_environment"),
				).toBe(true)
				const response = await client.callTool({
					name: "get_api_environment",
					arguments: {},
				})
				expect(JSON.parse(response.content[0].text).environment).toBe("develop")
			} finally {
				await client.close()
			}
		})
	}
})
