/**
 * MCP tools that surface the GxP documentation at https://docs.gxp.dev to
 * AI assistants.
 */

const {
	fetchSitemap,
	fetchPageText,
	searchPages,
	resolvePageUrl,
} = require("./docs")

function contentResult(obj) {
	return {
		content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
	}
}

const DOCS_TOOLS = [
	{
		name: "docs_list_pages",
		description:
			"List every page in the GxP docs sitemap (https://docs.gxp.dev). Optionally filter by URL path prefix.",
		inputSchema: {
			type: "object",
			properties: {
				prefix: {
					type: "string",
					description:
						"Only return URLs whose path starts with this prefix, e.g. '/gx-devtools' or '/guides'.",
				},
				refresh: {
					type: "boolean",
					default: false,
					description: "Bypass the sitemap cache (1-hour TTL).",
				},
			},
			required: [],
		},
	},
	{
		name: "docs_search",
		description:
			"Full-text search across the GxP documentation. Scores each page by term hits (title 3x, heading 2x, body 1x) and returns the top N with snippets. First call per cache window fetches every page; subsequent calls are fast.",
		inputSchema: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description:
						"Free-text query. Multi-word queries are AND-scored across all terms.",
				},
				limit: {
					type: "integer",
					default: 10,
					minimum: 1,
					maximum: 50,
				},
				refresh: {
					type: "boolean",
					default: false,
					description: "Bypass all caches and refetch.",
				},
			},
			required: ["query"],
		},
	},
	{
		name: "docs_get_page",
		description:
			"Return the structured text of a single documentation page: title, heading list, full article body. Accepts a full URL or a slug relative to https://docs.gxp.dev.",
		inputSchema: {
			type: "object",
			properties: {
				url_or_slug: {
					type: "string",
					description:
						"Either 'https://docs.gxp.dev/gx-devtools/cli-reference' or 'gx-devtools/cli-reference'.",
				},
				refresh: {
					type: "boolean",
					default: false,
				},
			},
			required: ["url_or_slug"],
		},
	},
]

async function handleDocsToolCall(name, args = {}) {
	switch (name) {
		case "docs_list_pages": {
			const urls = await fetchSitemap({ refresh: !!args.refresh })
			const filtered = args.prefix
				? urls.filter((u) => {
						try {
							return new URL(u).pathname.startsWith(args.prefix)
						} catch {
							return false
						}
					})
				: urls
			return contentResult({ count: filtered.length, urls: filtered })
		}

		case "docs_search": {
			const results = await searchPages(args.query, {
				limit: args.limit ?? 10,
				refresh: !!args.refresh,
			})
			return contentResult({
				query: args.query,
				count: results.length,
				results,
			})
		}

		case "docs_get_page": {
			const url = resolvePageUrl(args.url_or_slug)
			const page = await fetchPageText(url, { refresh: !!args.refresh })
			return contentResult({
				url: page.url,
				title: page.title,
				headings: page.headings,
				body: page.body,
			})
		}

		default:
			throw new Error(`Unknown docs tool: ${name}`)
	}
}

function isDocsTool(name) {
	return DOCS_TOOLS.some((t) => t.name === name)
}

module.exports = {
	DOCS_TOOLS,
	handleDocsToolCall,
	isDocsTool,
}
