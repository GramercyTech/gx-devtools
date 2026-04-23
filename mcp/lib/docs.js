/**
 * GxP documentation fetcher + searcher.
 *
 * Source of truth: https://docs.gxp.dev (Docusaurus, statically pre-rendered).
 * We discover pages from `/sitemap.xml`, extract title + heading list +
 * article body text from each page's HTML with a handful of regexes (no
 * HTML parser dep), and cache everything in-memory.
 *
 * Two caches:
 *   - sitemap  : 1 hour TTL
 *   - pages    : 30 min TTL, keyed by URL
 *
 * Search is eager: the first `searchPages` call (per cache window) fetches
 * every page in the sitemap with a concurrency cap. ~77 pages of ~10KB each
 * = well under 1 MB, acceptable for an MCP server session.
 *
 * Injection points for tests: __setSitemapForTest, __setPageForTest.
 */

const DOCS_BASE = "https://docs.gxp.dev"
const SITEMAP_URL = `${DOCS_BASE}/sitemap.xml`

const SITEMAP_TTL = 60 * 60 * 1000 // 1 hour
const PAGE_TTL = 30 * 60 * 1000 // 30 minutes
const FETCH_CONCURRENCY = 6

const sitemapCache = { urls: null, fetchedAt: 0 }
/** @type {Map<string, { title, headings, body, fetchedAt }>} */
const pageCache = new Map()

/* -------------------------------- fetching ------------------------------- */

async function fetchSitemap({ refresh = false } = {}) {
	const now = Date.now()
	if (
		!refresh &&
		sitemapCache.urls &&
		now - sitemapCache.fetchedAt < SITEMAP_TTL
	) {
		return sitemapCache.urls
	}
	const res = await fetch(SITEMAP_URL)
	if (!res.ok) {
		throw new Error(
			`Failed to fetch sitemap from ${SITEMAP_URL}: HTTP ${res.status}`,
		)
	}
	const xml = await res.text()
	const urls = parseSitemap(xml)
	sitemapCache.urls = urls
	sitemapCache.fetchedAt = now
	return urls
}

function parseSitemap(xml) {
	const out = []
	const re = /<loc>([^<]+)<\/loc>/g
	let m
	while ((m = re.exec(xml)) !== null) {
		const url = m[1].trim()
		if (url) out.push(url)
	}
	return out
}

async function fetchPageText(url, { refresh = false } = {}) {
	const now = Date.now()
	const cached = pageCache.get(url)
	if (!refresh && cached && now - cached.fetchedAt < PAGE_TTL) {
		return cached
	}

	const res = await fetch(url, { redirect: "follow" })
	if (!res.ok) {
		throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`)
	}
	const html = await res.text()
	const extracted = extractFromHtml(html)
	const record = { ...extracted, url, fetchedAt: now }
	pageCache.set(url, record)
	return record
}

/* -------------------------- regex-based extraction ----------------------- */

function stripTags(s) {
	return s.replace(/<[^>]+>/g, "")
}

function decodeEntities(s) {
	return s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
		.replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
			String.fromCharCode(parseInt(h, 16)),
		)
}

function clean(text) {
	return decodeEntities(stripTags(text)).replace(/\s+/g, " ").trim()
}

function extractFromHtml(html) {
	// Title: prefer the first <h1> inside the article body; fall back to <title>.
	const titleH1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
	const titleTag = /<title>([\s\S]*?)<\/title>/i.exec(html)
	const title = clean((titleH1?.[1] ?? titleTag?.[1] ?? "").toString())

	// Article body; fall back to full doc if Docusaurus structure changes.
	const articleMatch = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(html)
	const bodyHtml = articleMatch ? articleMatch[1] : html

	const headings = []
	const headingRe = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi
	let m
	while ((m = headingRe.exec(bodyHtml)) !== null) {
		const text = clean(m[2])
		if (text) headings.push({ level: Number(m[1]), text })
	}

	const body = clean(bodyHtml)

	return { title, headings, body }
}

/* --------------------------------- search -------------------------------- */

function scorePage(page, terms) {
	const titleL = page.title.toLowerCase()
	const bodyL = page.body.toLowerCase()
	const headingsText = page.headings.map((h) => h.text.toLowerCase()).join(" ")

	let score = 0
	for (const t of terms) {
		const titleHits = occurrences(titleL, t)
		const headingHits = occurrences(headingsText, t)
		const bodyHits = occurrences(bodyL, t)
		score += titleHits * 3 + headingHits * 2 + bodyHits
	}
	return score
}

function occurrences(haystack, needle) {
	if (!needle) return 0
	let count = 0
	let idx = 0
	while ((idx = haystack.indexOf(needle, idx)) !== -1) {
		count++
		idx += needle.length
	}
	return count
}

function snippet(body, terms, chars = 200) {
	const lower = body.toLowerCase()
	let first = -1
	for (const t of terms) {
		const i = lower.indexOf(t)
		if (i !== -1 && (first === -1 || i < first)) first = i
	}
	if (first === -1) return body.slice(0, chars)
	const start = Math.max(0, first - Math.floor(chars / 4))
	const end = Math.min(body.length, start + chars)
	const prefix = start > 0 ? "…" : ""
	const suffix = end < body.length ? "…" : ""
	return prefix + body.slice(start, end) + suffix
}

/**
 * Fetch all sitemap URLs with a concurrency cap and return the pages array.
 * Pages that fail to fetch are silently omitted.
 */
async function fetchAllPages({ refresh = false } = {}) {
	const urls = await fetchSitemap({ refresh })
	const queue = [...urls]
	const results = []

	async function worker() {
		while (queue.length) {
			const url = queue.shift()
			try {
				results.push(await fetchPageText(url, { refresh }))
			} catch {
				// Skip transient fetch failures — one bad page shouldn't sink the whole search.
			}
		}
	}

	const workers = Array.from({ length: FETCH_CONCURRENCY }, () => worker())
	await Promise.all(workers)
	return results
}

async function searchPages(query, { limit = 10, refresh = false } = {}) {
	const terms = String(query || "")
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
	if (!terms.length) return []

	const pages = await fetchAllPages({ refresh })
	const scored = []
	for (const page of pages) {
		const score = scorePage(page, terms)
		if (score > 0) {
			scored.push({
				url: page.url,
				title: page.title,
				score,
				snippet: snippet(page.body, terms),
			})
		}
	}
	scored.sort((a, b) => b.score - a.score)
	return scored.slice(0, limit)
}

/* --------------------------------- resolve -------------------------------- */

function resolvePageUrl(input) {
	if (!input) throw new Error("url_or_slug is required")
	if (/^https?:\/\//i.test(input)) return input
	const slug = input.replace(/^\/+/, "").replace(/\/+$/, "")
	return `${DOCS_BASE}/${slug}`
}

/* ------------------------------- test seams ------------------------------ */

function __setSitemapForTest(urls) {
	sitemapCache.urls = urls
	sitemapCache.fetchedAt = Date.now()
}

function __setPageForTest(url, { title = "", headings = [], body = "" }) {
	pageCache.set(url, { url, title, headings, body, fetchedAt: Date.now() })
}

function __resetCacheForTest() {
	sitemapCache.urls = null
	sitemapCache.fetchedAt = 0
	pageCache.clear()
}

module.exports = {
	DOCS_BASE,
	fetchSitemap,
	fetchPageText,
	fetchAllPages,
	searchPages,
	parseSitemap,
	extractFromHtml,
	scorePage,
	snippet,
	resolvePageUrl,
	__setSitemapForTest,
	__setPageForTest,
	__resetCacheForTest,
}
