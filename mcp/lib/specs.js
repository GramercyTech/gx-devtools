/**
 * Shared OpenAPI / AsyncAPI / Webhook spec fetching with an in-memory cache.
 * Used by both the main MCP server and the extended api-tools module.
 *
 * Environment detection: reads VITE_API_ENV/API_ENV from the project's .env
 * file first, then falls back to process.env, then defaults to "develop".
 *
 * Cache: 5-minute TTL, shared across all callers in the same process.
 */

const fs = require("fs")
const path = require("path")

const ENVIRONMENT_URLS = {
	production: {
		apiBaseUrl: "https://api.gramercy.cloud",
		openApiSpec: "https://api.gramercy.cloud/api-specs/openapi.json",
		asyncApiSpec: "https://api.gramercy.cloud/api-specs/asyncapi.json",
		webhookSpec: "https://api.gramercy.cloud/api-specs/webhooks.json",
	},
	staging: {
		apiBaseUrl: "https://api.efz-staging.env.eventfinity.app",
		openApiSpec:
			"https://api.efz-staging.env.eventfinity.app/api-specs/openapi.json",
		asyncApiSpec:
			"https://api.efz-staging.env.eventfinity.app/api-specs/asyncapi.json",
		webhookSpec:
			"https://api.efz-staging.env.eventfinity.app/api-specs/webhooks.json",
	},
	testing: {
		apiBaseUrl: "https://api.zenith-develop-testing.env.eventfinity.app",
		openApiSpec:
			"https://api.zenith-develop-testing.env.eventfinity.app/api-specs/openapi.json",
		asyncApiSpec:
			"https://api.zenith-develop-testing.env.eventfinity.app/api-specs/asyncapi.json",
		webhookSpec:
			"https://api.zenith-develop-testing.env.eventfinity.app/api-specs/webhooks.json",
	},
	develop: {
		apiBaseUrl: "https://api.zenith-develop.env.eventfinity.app",
		openApiSpec:
			"https://api.zenith-develop.env.eventfinity.app/api-specs/openapi.json",
		asyncApiSpec:
			"https://api.zenith-develop.env.eventfinity.app/api-specs/asyncapi.json",
		webhookSpec:
			"https://api.zenith-develop.env.eventfinity.app/api-specs/webhooks.json",
	},
	local: {
		apiBaseUrl: "https://dashboard.eventfinity.test",
		openApiSpec: "https://api.eventfinity.test/api-specs/openapi.json",
		asyncApiSpec: "https://api.eventfinity.test/api-specs/asyncapi.json",
		webhookSpec: "https://api.eventfinity.test/api-specs/webhooks.json",
	},
}

const CACHE_TTL = 5 * 60 * 1000
const specCache = {
	openapi: null,
	asyncapi: null,
	webhooks: null,
	lastFetch: null,
}

function getEnvironment() {
	const envPath = path.join(process.cwd(), ".env")
	if (fs.existsSync(envPath)) {
		const envContent = fs.readFileSync(envPath, "utf-8")
		const match = envContent.match(/VITE_API_ENV=(\w+)/)
		if (match) {
			return match[1]
		}
	}
	return process.env.VITE_API_ENV || process.env.API_ENV || "develop"
}

function getEnvUrls() {
	const env = getEnvironment()
	return ENVIRONMENT_URLS[env] || ENVIRONMENT_URLS.develop
}

async function fetchSpec(specType) {
	const urls = getEnvUrls()
	const urlMap = {
		openapi: urls.openApiSpec,
		asyncapi: urls.asyncApiSpec,
		webhooks: urls.webhookSpec,
	}
	const url = urlMap[specType]
	if (!url) {
		throw new Error(`Unknown spec type: ${specType}`)
	}

	const now = Date.now()
	if (
		specCache[specType] &&
		specCache.lastFetch &&
		now - specCache.lastFetch < CACHE_TTL
	) {
		return specCache[specType]
	}

	const res = await fetch(url)
	if (!res.ok) {
		throw new Error(`Failed to fetch ${specType} spec: ${res.status}`)
	}
	const spec = await res.json()
	specCache[specType] = spec
	specCache.lastFetch = now
	return spec
}

/**
 * Test seam: allow tests to inject a fixed spec into the cache and freeze it.
 * Returns a restore function.
 */
function __setCacheForTest(overrides) {
	const prev = {
		openapi: specCache.openapi,
		asyncapi: specCache.asyncapi,
		webhooks: specCache.webhooks,
		lastFetch: specCache.lastFetch,
	}
	Object.assign(specCache, overrides, {
		lastFetch: Date.now(),
	})
	return () => Object.assign(specCache, prev)
}

module.exports = {
	ENVIRONMENT_URLS,
	getEnvironment,
	getEnvUrls,
	fetchSpec,
	__setCacheForTest,
}
