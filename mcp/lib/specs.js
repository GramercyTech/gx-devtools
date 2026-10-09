/**
 * Shared OpenAPI / AsyncAPI / Webhook spec fetching with an in-memory cache.
 * Used by both the main MCP server and the extended api-tools module.
 *
 * Environment detection: reads VITE_API_ENV/API_ENV from the project's .env
 * file first, then falls back to process.env, then defaults to "develop".
 *
 * GXDEV_API_SPEC_BASE_URL optionally selects an operator-configured HTTPS origin.
 * Cache: independent 5-minute TTL per resolved specification URL.
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
const specCache = new Map()

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
	const defaults = ENVIRONMENT_URLS[env]
	if (!defaults) throw new Error(`Unknown API environment: ${env}`)
	const override = process.env.GXDEV_API_SPEC_BASE_URL
	if (!override) return defaults
	const base = new URL(override)
	if (
		base.protocol !== "https:" ||
		base.username ||
		base.password ||
		base.search ||
		base.hash ||
		base.pathname !== "/"
	) {
		throw new Error(
			"GXDEV_API_SPEC_BASE_URL must be an HTTPS origin without credentials",
		)
	}
	return {
		apiBaseUrl: base.origin,
		openApiSpec: `${base.origin}/api-specs/openapi.json`,
		asyncApiSpec: `${base.origin}/api-specs/asyncapi.json`,
		webhookSpec: `${base.origin}/api-specs/webhooks.json`,
	}
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

	const cached = specCache.get(url)
	if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
		return cached.spec
	}

	const res = await fetch(url, {
		redirect: "error",
		signal: AbortSignal.timeout(10_000),
	})
	if (!res.ok) {
		throw new Error(`Failed to fetch ${specType} spec: ${res.status}`)
	}
	const spec = await res.json()
	specCache.set(url, { spec, fetchedAt: Date.now() })
	return spec
}

/**
 * Test seam: allow tests to inject a fixed spec into the cache and freeze it.
 * Returns a restore function.
 */
function __setCacheForTest(overrides) {
	const previous = new Map(specCache)
	const urls = getEnvUrls()
	for (const [kind, field] of Object.entries({
		openapi: "openApiSpec",
		asyncapi: "asyncApiSpec",
		webhooks: "webhookSpec",
	})) {
		if (Object.prototype.hasOwnProperty.call(overrides, kind)) {
			if (overrides[kind] == null) specCache.delete(urls[field])
			else
				specCache.set(urls[field], {
					spec: overrides[kind],
					fetchedAt: Date.now(),
				})
		}
	}
	return () => {
		specCache.clear()
		for (const [url, value] of previous) specCache.set(url, value)
	}
}

module.exports = {
	ENVIRONMENT_URLS,
	getEnvironment,
	getEnvUrls,
	fetchSpec,
	__setCacheForTest,
}
