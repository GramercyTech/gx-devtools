/**
 * Tests for the docs fetch/extract/search pipeline + the MCP docs tools.
 * All fetches are short-circuited via __setSitemapForTest / __setPageForTest,
 * so nothing hits the network.
 */
import { describe, it, expect, beforeEach } from "vitest"

// eslint-disable-next-line no-undef
const {
	parseSitemap,
	extractFromHtml,
	scorePage,
	snippet,
	resolvePageUrl,
	__setSitemapForTest,
	__setPageForTest,
	__resetCacheForTest,
} = require("../../mcp/lib/docs")

// eslint-disable-next-line no-undef
const {
	DOCS_TOOLS,
	handleDocsToolCall,
	isDocsTool,
} = require("../../mcp/lib/docs-tools")

const SAMPLE_HTML = `
<!doctype html>
<html>
<head><title>Docs — Socket Events | GxP</title></head>
<body>
<nav>ignored</nav>
<article>
  <h1>Socket Events</h1>
  <p>Primary socket fans out messages to all connected clients.</p>
  <h2>Broadcasting</h2>
  <p>Call <code>store.broadcast("primary", "event", data)</code> to send.</p>
  <h3>Error handling</h3>
  <p>Listeners should handle malformed payloads gracefully.</p>
</article>
</body>
</html>
`

const SAMPLE_SITEMAP = `
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://docs.gxp.dev/</loc><priority>0.5</priority></url>
  <url><loc>https://docs.gxp.dev/gx-devtools/socket-events</loc></url>
  <url><loc>https://docs.gxp.dev/guides/real-time-events</loc></url>
</urlset>
`

function parseResult(res) {
	return JSON.parse(res.content[0].text)
}

beforeEach(() => {
	__resetCacheForTest()
})

describe("parseSitemap", () => {
	it("extracts every <loc>", () => {
		const urls = parseSitemap(SAMPLE_SITEMAP)
		expect(urls).toEqual([
			"https://docs.gxp.dev/",
			"https://docs.gxp.dev/gx-devtools/socket-events",
			"https://docs.gxp.dev/guides/real-time-events",
		])
	})
	it("returns [] for empty XML", () => {
		expect(parseSitemap("")).toEqual([])
	})
})

describe("extractFromHtml", () => {
	it("finds title, headings, body text", () => {
		const extracted = extractFromHtml(SAMPLE_HTML)
		expect(extracted.title).toBe("Socket Events")
		expect(extracted.headings).toEqual([
			{ level: 1, text: "Socket Events" },
			{ level: 2, text: "Broadcasting" },
			{ level: 3, text: "Error handling" },
		])
		expect(extracted.body).toMatch(/Primary socket fans out messages/)
		expect(extracted.body).not.toMatch(/<article/)
	})
	it("falls back to <title> when no h1", () => {
		const html = `<html><head><title>Plain</title></head><body><p>No h1</p></body></html>`
		const e = extractFromHtml(html)
		expect(e.title).toBe("Plain")
	})
	it("decodes entities", () => {
		const html = `<article><h1>A &amp; B</h1><p>x &#8212; y</p></article>`
		const e = extractFromHtml(html)
		expect(e.title).toBe("A & B")
		expect(e.body).toContain("—")
	})
})

describe("scorePage", () => {
	const page = {
		url: "x",
		title: "Socket Events",
		headings: [
			{ level: 1, text: "Socket Events" },
			{ level: 2, text: "Broadcasting" },
		],
		body: "primary socket fans out messages broadcast listen socket socket",
	}
	it("weights title > headings > body", () => {
		// "socket": title has 1 hit (3x=3), headings have 1 hit (2x=2), body has 3 hits (1x=3) => 8
		expect(scorePage(page, ["socket"])).toBe(8)
	})
	it("sums multiple terms", () => {
		// term "socket" (8) + term "broadcast" (heading 2 + body 1) => 11
		expect(scorePage(page, ["socket", "broadcast"])).toBe(11)
	})
	it("returns 0 when no hits", () => {
		expect(scorePage(page, ["nonexistent"])).toBe(0)
	})
})

describe("snippet", () => {
	it("centers on the first matching term", () => {
		const body =
			"lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt"
		const s = snippet(body, ["consectetur"], 40)
		expect(s).toContain("consectetur")
		expect(s.length).toBeLessThanOrEqual(42) // +/- ellipsis chars
	})
	it("slices from the start when no term matches", () => {
		const body = "the quick brown fox jumps over the lazy dog"
		expect(snippet(body, ["unicorn"], 10)).toBe("the quick ")
	})
})

describe("resolvePageUrl", () => {
	it("passes through absolute URLs", () => {
		expect(resolvePageUrl("https://docs.gxp.dev/x")).toBe(
			"https://docs.gxp.dev/x",
		)
	})
	it("prefixes slugs with DOCS_BASE", () => {
		expect(resolvePageUrl("gx-devtools/cli-reference")).toBe(
			"https://docs.gxp.dev/gx-devtools/cli-reference",
		)
		expect(resolvePageUrl("/guides/forms-builder")).toBe(
			"https://docs.gxp.dev/guides/forms-builder",
		)
	})
	it("rejects empty input", () => {
		expect(() => resolvePageUrl("")).toThrow()
	})
})

describe("docs tool registry", () => {
	it("exposes the expected tools", () => {
		const names = DOCS_TOOLS.map((t) => t.name)
		for (const n of ["docs_list_pages", "docs_search", "docs_get_page"]) {
			expect(names).toContain(n)
			expect(isDocsTool(n)).toBe(true)
		}
	})
	it("reports unknown tools as non-docs", () => {
		expect(isDocsTool("nope")).toBe(false)
	})
})

describe("docs_list_pages", () => {
	it("returns the whole sitemap when no prefix is set", async () => {
		__setSitemapForTest([
			"https://docs.gxp.dev/intro",
			"https://docs.gxp.dev/gx-devtools/cli-reference",
		])
		const out = parseResult(await handleDocsToolCall("docs_list_pages", {}))
		expect(out.count).toBe(2)
		expect(out.urls).toEqual([
			"https://docs.gxp.dev/intro",
			"https://docs.gxp.dev/gx-devtools/cli-reference",
		])
	})
	it("filters by prefix", async () => {
		__setSitemapForTest([
			"https://docs.gxp.dev/intro",
			"https://docs.gxp.dev/gx-devtools/cli-reference",
			"https://docs.gxp.dev/gx-devtools/socket-events",
			"https://docs.gxp.dev/guides/forms-builder",
		])
		const out = parseResult(
			await handleDocsToolCall("docs_list_pages", {
				prefix: "/gx-devtools",
			}),
		)
		expect(out.count).toBe(2)
		expect(out.urls.every((u) => u.includes("/gx-devtools/"))).toBe(true)
	})
})

describe("docs_search", () => {
	it("ranks pages by score and returns snippets", async () => {
		const urls = [
			"https://docs.gxp.dev/gx-devtools/socket-events",
			"https://docs.gxp.dev/guides/real-time-events",
			"https://docs.gxp.dev/intro",
		]
		__setSitemapForTest(urls)
		__setPageForTest(urls[0], {
			title: "Socket Events",
			headings: [{ level: 1, text: "Socket Events" }],
			body: "socket socket broadcast fan out clients connected",
		})
		__setPageForTest(urls[1], {
			title: "Real-time events",
			headings: [{ level: 2, text: "Broadcasting" }],
			body: "Listen to real time events broadcast across clients",
		})
		__setPageForTest(urls[2], {
			title: "Intro",
			headings: [],
			body: "Welcome to the GxP platform.",
		})

		const out = parseResult(
			await handleDocsToolCall("docs_search", { query: "socket broadcast" }),
		)
		expect(out.count).toBeGreaterThan(0)
		expect(out.results[0].url).toBe(urls[0])
		expect(out.results[0].snippet).toMatch(/socket|broadcast/)
	})

	it("returns zero results when no term matches", async () => {
		const urls = ["https://docs.gxp.dev/intro"]
		__setSitemapForTest(urls)
		__setPageForTest(urls[0], {
			title: "Intro",
			headings: [],
			body: "a b c d",
		})
		const out = parseResult(
			await handleDocsToolCall("docs_search", { query: "socket" }),
		)
		expect(out.count).toBe(0)
		expect(out.results).toEqual([])
	})

	it("respects the limit", async () => {
		const urls = Array.from(
			{ length: 15 },
			(_, i) => `https://docs.gxp.dev/page-${i}`,
		)
		__setSitemapForTest(urls)
		for (const u of urls) {
			__setPageForTest(u, {
				title: `Page matching socket`,
				headings: [],
				body: "socket",
			})
		}
		const out = parseResult(
			await handleDocsToolCall("docs_search", { query: "socket", limit: 5 }),
		)
		expect(out.results).toHaveLength(5)
	})
})

describe("docs_get_page", () => {
	it("returns structured page data from cache", async () => {
		const url = "https://docs.gxp.dev/gx-devtools/cli-reference"
		__setSitemapForTest([url])
		__setPageForTest(url, {
			title: "CLI Reference",
			headings: [
				{ level: 1, text: "CLI Reference" },
				{ level: 2, text: "gxdev dev" },
			],
			body: "All gxdev commands live here.",
		})
		const out = parseResult(
			await handleDocsToolCall("docs_get_page", {
				url_or_slug: "gx-devtools/cli-reference",
			}),
		)
		expect(out.url).toBe(url)
		expect(out.title).toBe("CLI Reference")
		expect(out.headings[1].text).toBe("gxdev dev")
		expect(out.body).toContain("gxdev commands")
	})
})
