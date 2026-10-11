import { test, expect } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const operationId = "portal.v1.project.groups.attendees.index"

test.skipIf(process.env.RUN_LOCAL_CATALOG_QA !== "1")(
	"stdio metadata preserves the live platform binding and nested count schema",
	async () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "gxp-mcp-catalog-"))
		const client = new Client({ name: "local-catalog-qa", version: "1.0.0" })
		const transport = new StdioClientTransport({
			command: process.execPath,
			args: [
				process.env.GXDEV_QA_MCP_ENTRYPOINT ||
					fileURLToPath(new URL("../../mcp/mcp-serve.js", import.meta.url)),
			],
			cwd,
			env: {
				PATH: process.env.PATH,
				API_ENV: "local",
				GXDEV_API_SPEC_BASE_URL:
					process.env.GXDEV_API_SPEC_BASE_URL || "https://api.gxp.test",
				...(process.env.NODE_EXTRA_CA_CERTS
					? { NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS }
					: {}),
			},
			stderr: "pipe",
		})
		try {
			await client.connect(transport)
			async function call(name, args) {
				const response = await client.callTool({ name, arguments: args })
				expect(response.isError).not.toBe(true)
				return JSON.parse(
					response.content.find((item) => item.type === "text").text,
				)
			}
			const details = await call("api_get_operation_parameters", {
				operationId,
			})
			expect(details.binding.parent_route_key).toBe("slug")
			const generated = await call("api_generate_dependency", {
				identifier: "bound_group",
				tag: "AttendeeGroup",
				operationIds: [operationId],
			})
			expect(generated.ok).toBe(true)
			expect(generated.wrote).toBe(false)
			expect(generated.dependency.model).toBe("Group")
			expect(generated.dependency.key).toBe("slug")
			expect(generated.dependency.permissions).toEqual([
				"view_attendees",
				"view_groups",
			])
			expect(generated.configurationField).toMatchObject({
				name: "dependency_list.bound_group",
				route: "dashboard.project.groups.index",
				valueField: "slug",
			})
			const model = await call("describe_data_models", {
				name: "AttendeeCollection",
			})
			expect(model.models[0].properties.meta.properties.total.type).toBe(
				"integer",
			)
		} finally {
			await client.close()
			fs.rmSync(cwd, { recursive: true, force: true })
		}
	},
	30000,
)
