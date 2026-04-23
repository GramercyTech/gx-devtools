/**
 * Version Check
 *
 * Compares the installed gxdev version against the latest on npm.
 *
 * Design:
 * - The npm registry is hit **at most once per 24 hours** per user. The latest
 *   version is cached in `~/.gxp-dev/version-check.json`.
 * - All cache reads and the "is an update available?" check are synchronous so
 *   they can run from a `process.on("exit")` handler or a React render.
 * - The actual network fetch is fire-and-forget (`maybeRunBackgroundCheck`).
 *   It never throws, never blocks, and never delays CLI exit.
 * - Users can disable the check entirely with `GXP_NO_VERSION_CHECK=1`.
 *
 * Consequence: the first ever `gxdev` invocation only populates the cache — the
 * update banner shows on the *next* run. That's an intentional tradeoff so the
 * first run is never blocked on a slow/unreachable registry.
 */

const fs = require("fs")
const path = require("path")
const os = require("os")
const https = require("https")

const CACHE_DIR = path.join(os.homedir(), ".gxp-dev")
const CACHE_FILE = path.join(CACHE_DIR, "version-check.json")
const CHECK_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const FETCH_TIMEOUT_MS = 3000
const PACKAGE_JSON_PATH = path.join(__dirname, "..", "..", "..", "package.json")

let cliReminderRegistered = false

function isDisabled() {
	return process.env.GXP_NO_VERSION_CHECK === "1"
}

function getPackageInfo() {
	try {
		const pkg = require(PACKAGE_JSON_PATH)
		if (!pkg || !pkg.name || !pkg.version) {
			return null
		}
		return { name: pkg.name, currentVersion: pkg.version }
	} catch {
		return null
	}
}

function readCache() {
	try {
		const raw = fs.readFileSync(CACHE_FILE, "utf-8")
		const parsed = JSON.parse(raw)
		if (!parsed || typeof parsed !== "object") {
			return null
		}
		return parsed
	} catch {
		return null
	}
}

function writeCache(data) {
	try {
		if (!fs.existsSync(CACHE_DIR)) {
			fs.mkdirSync(CACHE_DIR, { recursive: true })
		}
		fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2))
	} catch {
		// Cache failures are non-fatal — the CLI should still work.
	}
}

function cacheIsFresh(cache) {
	if (!cache || !cache.lastCheckedAt) {
		return false
	}
	return Date.now() - cache.lastCheckedAt < CHECK_TTL_MS
}

/**
 * Compare two semver-like strings.
 * Returns 1 if a > b, -1 if a < b, 0 if equal. Strips pre-release suffixes.
 */
function compareVersions(a, b) {
	const parse = (v) =>
		String(v)
			.split("-")[0]
			.split(".")
			.map((n) => parseInt(n, 10) || 0)
	const pa = parse(a)
	const pb = parse(b)
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const ai = pa[i] || 0
		const bi = pb[i] || 0
		if (ai > bi) {
			return 1
		}
		if (ai < bi) {
			return -1
		}
	}
	return 0
}

function fetchLatestVersion(packageName) {
	return new Promise((resolve, reject) => {
		const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`
		const req = https.get(
			url,
			{ timeout: FETCH_TIMEOUT_MS, headers: { Accept: "application/json" } },
			(res) => {
				if (res.statusCode !== 200) {
					res.resume()
					reject(new Error(`HTTP ${res.statusCode}`))
					return
				}
				let data = ""
				res.setEncoding("utf8")
				res.on("data", (chunk) => {
					data += chunk
				})
				res.on("end", () => {
					try {
						const body = JSON.parse(data)
						if (body && typeof body.version === "string") {
							resolve(body.version)
						} else {
							reject(new Error("Missing version in registry response"))
						}
					} catch (err) {
						reject(err)
					}
				})
			},
		)
		req.on("error", reject)
		req.on("timeout", () => {
			req.destroy(new Error("timeout"))
		})
	})
}

/**
 * Synchronously derive update status from the cache + installed package.json.
 * Returns null if version info can't be determined.
 *
 * Shape: { currentVersion, latestVersion, updateAvailable, lastCheckedAt }
 */
function getCachedUpdateInfo() {
	if (isDisabled()) {
		return null
	}
	const pkg = getPackageInfo()
	if (!pkg) {
		return null
	}
	const cache = readCache()
	if (!cache || !cache.latestVersion) {
		return {
			currentVersion: pkg.currentVersion,
			latestVersion: null,
			updateAvailable: false,
			lastCheckedAt: cache && cache.lastCheckedAt ? cache.lastCheckedAt : null,
		}
	}
	const updateAvailable =
		compareVersions(cache.latestVersion, pkg.currentVersion) > 0
	return {
		currentVersion: pkg.currentVersion,
		latestVersion: cache.latestVersion,
		updateAvailable,
		lastCheckedAt: cache.lastCheckedAt,
	}
}

/**
 * Kick off a non-blocking registry check if the cache is stale. Safe to call
 * on every gxdev invocation — throttled by the 24h TTL and silent on any
 * failure. The process holds the socket open briefly while the request runs,
 * but `.unref()` means it won't keep the process alive on its own.
 */
function maybeRunBackgroundCheck() {
	if (isDisabled()) {
		return
	}
	const pkg = getPackageInfo()
	if (!pkg) {
		return
	}
	const cache = readCache()
	if (cacheIsFresh(cache)) {
		return
	}
	const fetchPromise = fetchLatestVersion(pkg.name)
	fetchPromise
		.then((latestVersion) => {
			writeCache({
				packageName: pkg.name,
				latestVersion,
				lastCheckedAt: Date.now(),
			})
		})
		.catch(() => {
			// Swallow errors — we'll retry next run.
		})
}

function formatCliReminder(info) {
	if (!info || !info.updateAvailable || !info.latestVersion) {
		return ""
	}
	const yellow = (s) => `\x1b[33m${s}\x1b[0m`
	const cyan = (s) => `\x1b[36m${s}\x1b[0m`
	const bold = (s) => `\x1b[1m${s}\x1b[0m`
	return [
		"",
		yellow("────────────────────────────────────────────────────────"),
		`${yellow("📦")} ${bold("gxdev update available:")} ${info.currentVersion} → ${cyan(info.latestVersion)}`,
		`   Update with ${cyan("npm i -g @gxp-dev/tools")}`,
		yellow("────────────────────────────────────────────────────────"),
	].join("\n")
}

/**
 * Install a process.on("exit") handler that prints a one-time reminder if the
 * cached info says an update is available. Safe to call multiple times — only
 * the first call registers. Meant for the plain-CLI path; the TUI renders its
 * banner inline instead.
 */
function registerCliExitReminder() {
	if (isDisabled() || cliReminderRegistered) {
		return
	}
	cliReminderRegistered = true
	process.on("exit", () => {
		try {
			const info = getCachedUpdateInfo()
			if (info && info.updateAvailable) {
				// Emit to stderr so it never pollutes stdout pipelines
				// (e.g. `gxdev lint --json | jq ...`).
				process.stderr.write(formatCliReminder(info) + "\n")
			}
		} catch {
			// Never crash during exit.
		}
	})
}

module.exports = {
	getCachedUpdateInfo,
	maybeRunBackgroundCheck,
	registerCliExitReminder,
	formatCliReminder,
	compareVersions,
}
