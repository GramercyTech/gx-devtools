/**
 * Spec Loader
 *
 * Fetches and caches OpenAPI, AsyncAPI, and Webhook specs from the platform.
 * Falls back to local files when the platform API is unreachable.
 */

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const https = require("https");

// Import environment URLs from constants
let ENVIRONMENT_URLS;
try {
	// When running from node_modules
	ENVIRONMENT_URLS = require("../../bin/lib/constants").ENVIRONMENT_URLS;
} catch {
	// Fallback for direct execution
	ENVIRONMENT_URLS = require(path.join(
		__dirname,
		"../../bin/lib/constants"
	)).ENVIRONMENT_URLS;
}

// Spec cache
const cache = {
	openApi: null,
	asyncApi: null,
	webhooks: null,
	lastFetch: null,
};

// Default cache TTL (5 minutes)
const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

/**
 * Get cache TTL from environment or use default
 */
function getCacheTTL() {
	return parseInt(process.env.MOCK_API_CACHE_TTL) || DEFAULT_CACHE_TTL;
}

/**
 * Get environment configuration based on API_ENV
 * @param {string} env - Environment name (defaults to 'production')
 * @returns {object} Environment URLs configuration
 */
function getEnvironmentConfig(env) {
	const envName = env || process.env.API_ENV || "production";
	const config = ENVIRONMENT_URLS[envName];

	if (!config) {
		console.warn(
			`⚠️  Unknown environment "${envName}", falling back to production`
		);
		return ENVIRONMENT_URLS.production;
	}

	return config;
}

/**
 * Create axios instance with SSL handling for local development
 */
function createHttpClient() {
	return axios.create({
		timeout: 10000,
		httpsAgent: new https.Agent({
			rejectUnauthorized: process.env.NODE_ENV === "production",
		}),
	});
}

/**
 * Fetch a spec from a URL
 * @param {string} url - URL to fetch
 * @param {string} specName - Name for logging
 * @returns {object|null} Parsed JSON spec or null on error
 */
async function fetchSpec(url, specName) {
	const client = createHttpClient();

	try {
		console.log(`📡 Fetching ${specName} from ${url}`);
		const response = await client.get(url);
		console.log(`✅ ${specName} loaded successfully`);
		return response.data;
	} catch (error) {
		const message = error.response
			? `HTTP ${error.response.status}`
			: error.message;
		console.warn(`⚠️  Failed to fetch ${specName}: ${message}`);
		return null;
	}
}

/**
 * Load a spec from a local file
 * @param {string} projectRoot - Project root directory
 * @param {string} filename - Filename to load
 * @param {string} specName - Name for logging
 * @returns {object|null} Parsed JSON spec or null if not found
 */
function loadLocalSpec(projectRoot, filename, specName) {
	const filePath = path.join(projectRoot, filename);

	if (!fs.existsSync(filePath)) {
		return null;
	}

	try {
		console.log(`📁 Loading local ${specName} from ${filename}`);
		const content = fs.readFileSync(filePath, "utf-8");
		const spec = JSON.parse(content);
		console.log(`✅ Local ${specName} loaded successfully`);
		return spec;
	} catch (error) {
		console.warn(`⚠️  Failed to parse local ${specName}: ${error.message}`);
		return null;
	}
}

/**
 * Fetch OpenAPI spec from platform or local file
 * @param {string} projectRoot - Project root for local fallback
 * @returns {object|null} OpenAPI spec
 */
async function fetchOpenApiSpec(projectRoot) {
	const config = getEnvironmentConfig();

	// Try remote first
	let spec = await fetchSpec(config.openApiSpec, "OpenAPI spec");

	// Fallback to local
	if (!spec && projectRoot) {
		spec = loadLocalSpec(projectRoot, "openapi.json", "OpenAPI spec");
	}

	return spec;
}

/**
 * Fetch AsyncAPI spec from platform or local file
 * @param {string} projectRoot - Project root for local fallback
 * @returns {object|null} AsyncAPI spec
 */
async function fetchAsyncApiSpec(projectRoot) {
	const config = getEnvironmentConfig();

	// Try remote first
	let spec = await fetchSpec(config.asyncApiSpec, "AsyncAPI spec");

	// Fallback to local
	if (!spec && projectRoot) {
		spec = loadLocalSpec(projectRoot, "asyncapi.json", "AsyncAPI spec");
	}

	return spec;
}

/**
 * Fetch Webhook spec from platform or local file
 * @param {string} projectRoot - Project root for local fallback
 * @returns {object|null} Webhook spec
 */
async function fetchWebhookSpec(projectRoot) {
	const config = getEnvironmentConfig();

	// Try remote first
	let spec = await fetchSpec(config.webhookSpec, "Webhook spec");

	// Fallback to local
	if (!spec && projectRoot) {
		spec = loadLocalSpec(projectRoot, "webhooks.json", "Webhook spec");
	}

	return spec;
}

/**
 * Check if cache is still valid
 * @returns {boolean} True if cache is valid
 */
function isCacheValid() {
	if (!cache.lastFetch) {
		return false;
	}

	const elapsed = Date.now() - cache.lastFetch;
	return elapsed < getCacheTTL();
}

/**
 * Load all specs with caching
 * @param {string} projectRoot - Project root for local fallback
 * @param {boolean} forceRefresh - Force refresh even if cache is valid
 * @returns {object} Object containing all specs
 */
async function loadSpecs(projectRoot, forceRefresh = false) {
	// Return cached if valid and not forcing refresh
	if (!forceRefresh && isCacheValid()) {
		console.log("📦 Using cached specs");
		return {
			openApi: cache.openApi,
			asyncApi: cache.asyncApi,
			webhooks: cache.webhooks,
		};
	}

	const root = projectRoot || process.cwd();

	console.log("🔄 Loading API specs...");
	console.log(`   Environment: ${process.env.API_ENV || "production"}`);

	// Fetch all specs in parallel
	const [openApi, asyncApi, webhooks] = await Promise.all([
		fetchOpenApiSpec(root),
		fetchAsyncApiSpec(root),
		fetchWebhookSpec(root),
	]);

	// Update cache
	cache.openApi = openApi;
	cache.asyncApi = asyncApi;
	cache.webhooks = webhooks;
	cache.lastFetch = Date.now();

	// Log summary
	const loaded = [];
	if (openApi) loaded.push("OpenAPI");
	if (asyncApi) loaded.push("AsyncAPI");
	if (webhooks) loaded.push("Webhooks");

	if (loaded.length > 0) {
		console.log(`✅ Loaded specs: ${loaded.join(", ")}`);
	} else {
		console.warn("⚠️  No specs were loaded");
	}

	return { openApi, asyncApi, webhooks };
}

/**
 * Clear the spec cache and refetch
 * @param {string} projectRoot - Project root for local fallback
 * @returns {object} Freshly loaded specs
 */
async function refreshSpecs(projectRoot) {
	console.log("🔄 Refreshing API specs...");
	cache.openApi = null;
	cache.asyncApi = null;
	cache.webhooks = null;
	cache.lastFetch = null;

	return loadSpecs(projectRoot, true);
}

/**
 * Get current cache status
 * @returns {object} Cache status info
 */
function getCacheStatus() {
	const ttl = getCacheTTL();
	const elapsed = cache.lastFetch ? Date.now() - cache.lastFetch : null;

	return {
		hasOpenApi: !!cache.openApi,
		hasAsyncApi: !!cache.asyncApi,
		hasWebhooks: !!cache.webhooks,
		lastFetch: cache.lastFetch ? new Date(cache.lastFetch).toISOString() : null,
		cacheValid: isCacheValid(),
		ttlMs: ttl,
		expiresIn: elapsed !== null ? Math.max(0, ttl - elapsed) : null,
	};
}

/**
 * Get the raw cached specs (for direct access)
 * @returns {object} Cached specs
 */
function getCachedSpecs() {
	return {
		openApi: cache.openApi,
		asyncApi: cache.asyncApi,
		webhooks: cache.webhooks,
	};
}

module.exports = {
	getEnvironmentConfig,
	fetchOpenApiSpec,
	fetchAsyncApiSpec,
	fetchWebhookSpec,
	loadSpecs,
	refreshSpecs,
	getCacheStatus,
	getCachedSpecs,
	isCacheValid,
};
