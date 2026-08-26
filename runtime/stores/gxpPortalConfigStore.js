import { defineStore } from "pinia"
import { ref, computed, reactive, watch, markRaw } from "vue"
import axios from "axios"
import { io } from "socket.io-client"
import { useGxpFormStore, disposeGxpFormStore } from "./gxpFormStore.js"

/**
 * Dev-server implementation of the platform's gxpPortalConfigStore.
 *
 * PARITY CONTRACT: every state key and method the platform store
 * (experience-portal/resources/js/Store/gxpPortalConfigStore.js) returns
 * must exist here with the same name, signature, and return shape. The
 * internals differ — the platform runs on Laravel Echo against the portal
 * origin, this runs on a local Socket.IO relay against the mock API or the
 * Vite proxy — but a plugin must not be able to tell the difference. When
 * the platform store gains a member, add it here (and to
 * tests/runtime/portal-store.test.js, which asserts the surface).
 *
 * Dev-only extras (`user`, `getUser*`, `manifest*`, `apiPatch`,
 * `updateSetting`, `updateState`) are kept for the DevTools UI and existing
 * templates; they are NOT available on the platform.
 */

// Environment URL configuration (matches constants.js ENVIRONMENT_URLS).
// These are API *hosts*. Like the platform, callApi prefixes every operation
// path with "/api" itself, so none of these — nor any apiBaseUrl derived
// from them — should end in "/api".
const ENVIRONMENT_URLS = {
	production: {
		apiBaseUrl: "https://api.gramercy.cloud",
	},
	staging: {
		apiBaseUrl: "https://api.efz-staging.env.eventfinity.app",
	},
	testing: {
		apiBaseUrl: "https://api.zenith-develop-testing.env.eventfinity.app",
	},
	develop: {
		apiBaseUrl: "https://api.zenith-develop.env.eventfinity.app",
	},
	local: {
		apiBaseUrl: "https://dashboard.eventfinity.test",
	},
}

// Injection key for store ID — the platform uses provide/inject to hand child
// components the page store's id. The dev server has a single store, so the
// key is exported for import-compatibility only.
export const GXP_STORE_ID_KEY = "gxpStoreId"

/**
 * Generate a random bearer token for mock API
 */
function generateMockToken() {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	let token = ""
	for (let i = 0; i < 32; i++) {
		token += chars.charAt(Math.floor(Math.random() * chars.length))
	}
	return token
}

/**
 * Get API configuration based on API_ENV environment variable.
 *
 * `apiBaseUrl` is always the API *host* (or a proxy path that maps to the
 * host root). callApi appends "/api" + the OpenAPI path on top of it, exactly
 * like the platform store does against the portal origin, so a plugin's
 * `apiGet("/api/v1/...")` and `callApi(...)` resolve identically in both.
 *
 * - mock:      local mock server (mounts its routes under /api)
 * - dev-mock:  cloud mock host
 * - dev+proxy: Vite proxy at /api-proxy — the proxy strips its own prefix and
 *              forwards to the real host, which injects the Authorization header
 * - build:     the real host directly
 *
 * `apiDocsBaseUrl` is where the OpenAPI spec is fetched from
 * (`${apiDocsBaseUrl}/api-specs/openapi.json`); it defaults to apiBaseUrl.
 *
 * @returns {{ apiBaseUrl: string, apiDocsBaseUrl?: string, authToken: string, projectId: string }}
 */
function getApiConfig() {
	const apiEnv = import.meta.env.VITE_API_ENV || "mock"
	const apiKey = import.meta.env.VITE_API_KEY || ""
	const projectId = import.meta.env.VITE_API_PROJECT_ID || ""
	const useHttps = import.meta.env.VITE_USE_HTTPS !== "false"
	const nodePort = import.meta.env.VITE_NODE_PORT || "3060"
	const mockPort = import.meta.env.VITE_SOCKET_IO_PORT || "3069"
	const socketUrl = import.meta.env.SOCKET_URL || `/`

	// Check if we're in development mode (Vite dev server)
	const isDev = import.meta.env.DEV
	const protocol = useHttps ? "https" : "http"

	if (apiEnv === "mock") {
		// Mock API: use local dev server with random token
		return {
			apiDocsBaseUrl: ENVIRONMENT_URLS.production.apiBaseUrl,
			apiBaseUrl: `${protocol}://localhost:${mockPort}`,
			authToken: generateMockToken(),
			projectId: "team/project",
		}
	}
	if (apiEnv === "dev-mock") {
		// cloud dev mock
		return {
			apiDocsBaseUrl: ENVIRONMENT_URLS.develop.apiBaseUrl,
			apiBaseUrl: `https://${socketUrl}`,
			authToken: generateMockToken(),
			projectId: "team/project",
		}
	}
	// For non-mock environments in development, use the local Vite proxy.
	// The proxy handles CORS and injects the Authorization header.
	if (isDev) {
		return {
			apiBaseUrl: `${protocol}://localhost:${nodePort}/api-proxy`,
			authToken: "", // Proxy injects the token server-side
			projectId: projectId,
		}
	}

	// Production build: use the actual API URL directly
	const envConfig = ENVIRONMENT_URLS[apiEnv]
	if (!envConfig) {
		console.warn(
			`[GxP Store] Unknown API_ENV "${apiEnv}", falling back to production`,
		)
		return {
			apiBaseUrl: ENVIRONMENT_URLS.production.apiBaseUrl,
			authToken: apiKey,
			projectId: projectId,
		}
	}

	return {
		apiBaseUrl: envConfig.apiBaseUrl,
		authToken: apiKey,
		projectId: projectId,
	}
}

// --- Multipart helpers (mirrors platform store) -----------------------------

// Detects payloads that must be sent as multipart/form-data: a FormData
// instance, or a plain object containing at least one Blob/File value.
// Anything else is treated as JSON.
function dataNeedsMultipart(data) {
	if (!data) return false
	if (typeof FormData !== "undefined" && data instanceof FormData) return true
	if (typeof data !== "object") return false
	for (const v of Object.values(data)) {
		if (typeof Blob !== "undefined" && v instanceof Blob) return true
	}
	return false
}

function appendField(fd, key, value) {
	if (value === undefined || value === null) return
	if (typeof Blob !== "undefined" && value instanceof Blob) {
		// Filename hint: caller can encode the extension into the key as
		// `field.ext`; otherwise derive from the blob's MIME type, falling
		// back to `bin`.
		const [name, ext] = key.split(".")
		const finalExt = ext ?? value.type?.split("/")[1] ?? "bin"
		fd.append(name, value, `file.${finalExt}`)
		return
	}
	if (Array.isArray(value)) {
		for (const sub of value) fd.append(`${key}[]`, sub)
		return
	}
	if (typeof value === "object") {
		for (const [sk, sv] of Object.entries(value)) {
			if (sv === undefined || sv === null) continue
			fd.append(`${key}[${sk}]`, sv)
		}
		return
	}
	fd.append(key, value)
}

function buildFormData(data) {
	if (typeof FormData !== "undefined" && data instanceof FormData) return data
	const fd = new FormData()
	for (const [k, v] of Object.entries(data ?? {})) appendField(fd, k, v)
	return fd
}

/**
 * Parse a dependency_list value (scalar id, or a mixed array of ids,
 * "#tag" references, and "@untagged") into structured buckets. Mirrors
 * the server-side DependencyMatcher grammar (EZ-2798).
 *
 * @returns {{ids: number[], tags: string[], untagged: boolean}}
 */
function parseDependencyValue(raw) {
	const ids = []
	const tags = []
	let untagged = false

	const tokens =
		raw === undefined || raw === null ? [] : Array.isArray(raw) ? raw : [raw]

	for (const token of tokens) {
		if (
			typeof token === "number" ||
			(typeof token === "string" && /^\d+$/.test(token))
		) {
			ids.push(Number(token))
		} else if (token === "@untagged") {
			untagged = true
		} else if (typeof token === "string" && token.startsWith("#")) {
			tags.push(token.slice(1))
		}
	}

	return { ids, tags, untagged }
}

// Dev-only fallback user. In production the platform injects the real
// authenticated user (or null) — this dummy only ships when running under
// the Vite dev server so plugins can develop against the happy-path shape.
// `groups` mirrors EZ-3006: the platform attaches the attendee's
// portal-visible groups as [{ name, slug }].
const DEV_DUMMY_USER = {
	id: "dev-user-001",
	first_name: "Jane",
	last_name: "Developer",
	name: "Jane Developer",
	email: "jane.developer@example.com",
	avatar: null,
	roles: ["attendee"],
	groups: [],
}

// Default values used when app-manifest.json doesn't exist or is missing keys
const defaultData = {
	pluginVars: {
		primary_color: "#FFD600",
		background_color: "#ffffff",
		text_color: "#333333",
	},
	stringsList: {},
	assetList: {},
	staticAssetList: {},
	dependencyList: {},
	permissionFlags: [],
	navigationFlagsKeyed: {},
	triggerState: {},
	// Platform shape: auth.user is the attendee (or null for guests).
	auth: { user: import.meta.env.DEV ? { ...DEV_DUMMY_USER } : null },
	userSession: import.meta.env.DEV ? "dev-session" : null,
	pluginData: {},
	portalAssets: {},
	portal: null,
}

const useGxpStoreDefinition = defineStore("gxp-portal-app", () => {
	// Core configuration - these will be injected by the platform in production
	const isLoaded = ref(false)
	const pluginVars = ref({ ...defaultData.pluginVars })
	const stringsList = ref({ ...defaultData.stringsList })
	const assetList = ref({ ...defaultData.assetList })
	const staticAssetList = ref({ ...defaultData.staticAssetList })
	const dependencyList = ref({ ...defaultData.dependencyList })
	const dependencies = ref([]) // Store full dependency objects for socket initialization
	const permissionFlags = ref([...defaultData.permissionFlags])
	const navigationFlagsKeyed = ref({ ...defaultData.navigationFlagsKeyed })
	const triggerState = ref({ ...defaultData.triggerState })

	// User session data (injected by platform in production)
	const auth = ref(
		defaultData.auth
			? {
					...defaultData.auth,
					user: defaultData.auth.user ? { ...defaultData.auth.user } : null,
				}
			: null,
	)
	const userSession = ref(defaultData.userSession)
	// Dev-only convenience mirror of auth.user (the platform exposes only
	// `auth`). Kept in two-way sync so clearing it from the DevTools store
	// inspector simulates the logged-out state everywhere.
	const user = ref(auth.value?.user ?? null)
	const pluginData = ref({ ...defaultData.pluginData })
	const portalAssets = ref({ ...defaultData.portalAssets })
	const portal = ref(defaultData.portal)
	const pageId = ref(null)
	const logout = ref(null)

	let syncingUser = false
	watch(
		user,
		(u) => {
			if (syncingUser) return
			syncingUser = true
			auth.value = { ...(auth.value ?? {}), user: u ?? null }
			syncingUser = false
		},
		{ flush: "sync" },
	)
	watch(
		() => auth.value?.user,
		(u) => {
			if (syncingUser) return
			syncingUser = true
			user.value = u ?? null
			syncingUser = false
		},
		{ flush: "sync" },
	)

	// Form store for form-backed apps (gxpStore.form.getElements() etc).
	// Attached automatically when app-manifest.json declares a `form`
	// section (or settings.formId), or explicitly via attachFormStore.
	// Mirrors the platform's gxpPortalConfigStore.form.
	const form = ref(null)

	/**
	 * Attach a gxpFormStore instance (or create one from a form key) so
	 * plugin authors can reach it as `gxpStore.form` without importing
	 * the form store module.
	 */
	function attachFormStore(formStoreOrKey) {
		form.value =
			typeof formStoreOrKey === "object" && formStoreOrKey !== null
				? formStoreOrKey
				: useGxpFormStore(formStoreOrKey)
		return form.value
	}

	// API Operations Registry - maps operationIds to endpoint configurations
	const apiOperations = ref({})

	// Loading state for manifest
	const manifestLoaded = ref(false)
	const manifestError = ref(null)

	// API configuration - initialized from environment
	const apiConfig = getApiConfig()
	const apiDocsBaseUrl = ref(apiConfig.apiDocsBaseUrl ?? apiConfig.apiBaseUrl)
	const apiBaseUrl = ref(apiConfig.apiBaseUrl)
	const authToken = ref(apiConfig.authToken)
	// Page-context token, sent as X-Portal-Page-Token on every request so the
	// API can resolve which page a call is made from (EZ-2797 dual token).
	// Defaults to authToken, as on the platform.
	const pageToken = ref(apiConfig.authToken)

	// The platform surfaces these three through pluginData; plugins (and
	// callApi) read them from pluginVars, so keep them present across
	// manifest reloads that replace the settings object.
	function applyApiPluginVars() {
		pluginVars.value.projectId ??= apiConfig.projectId
		pluginVars.value.apiPageAuthId ??= apiConfig.authToken
		pluginVars.value.apiBaseUrl ??= apiConfig.apiBaseUrl
	}
	applyApiPluginVars()

	// Log API configuration for debugging
	console.log(
		`[GxP Store] API Environment: ${import.meta.env.VITE_API_ENV || "mock"}`,
	)
	console.log(`[GxP Store] API Base URL: ${apiConfig.apiBaseUrl}`)

	// WebSocket configuration - initialized as reactive objects immediately
	const sockets = reactive({})
	const socketConnections = reactive({})
	const connectionStatus = ref("disconnected")
	const isOnline = ref(
		typeof navigator !== "undefined" ? navigator.onLine : true,
	)
	const quizChannels = reactive({})

	// Internet connectivity listeners
	const handleOnline = () => {
		isOnline.value = true
	}
	const handleOffline = () => {
		isOnline.value = false
	}
	if (typeof window !== "undefined") {
		window.addEventListener("online", handleOnline)
		window.addEventListener("offline", handleOffline)
	}

	// API client setup
	const apiClient = axios.create({
		timeout: 30000,
		headers: {
			"Content-Type": "application/json",
		},
	})

	// Add auth token to requests
	apiClient.interceptors.request.use((config) => {
		if (authToken.value) {
			config.headers.Authorization = `Bearer ${authToken.value}`
		}
		if (pageToken.value) {
			config.headers["X-Portal-Page-Token"] = pageToken.value
		}
		config.baseURL = apiBaseUrl.value
		return config
	})

	// Response interceptor for error handling
	apiClient.interceptors.response.use(
		(response) => response,
		(error) => {
			console.error("API Error:", error.response?.data || error.message)
			throw error
		},
	)

	function authHeaders() {
		const headers = {}
		if (authToken.value) {
			headers.Authorization = `Bearer ${authToken.value}`
		}
		if (pageToken.value) {
			headers["X-Portal-Page-Token"] = pageToken.value
		}
		return headers
	}

	// --- Web Push Notifications (EZ-2502) ----------------------------
	// Same surface and semantics as the platform. The platform reads the
	// VAPID key / feature flag from its boot vars; here they come from
	// VITE_VAPID_PUBLIC_KEY / VITE_PUSH_NOTIFICATIONS_ENABLED, and the
	// subscribe/unsubscribe/status calls go to the configured API host
	// instead of the portal origin. Without a key (the usual dev case)
	// every helper resolves exactly as it does on the platform when push
	// is unavailable: null / no-op / "not configured" error.
	const pushSubscription = ref(null)
	const pushEnv = {
		enabled: import.meta.env.VITE_PUSH_NOTIFICATIONS_ENABLED === "true",
		vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY || "",
	}

	function urlBase64ToUint8Array(base64String) {
		const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
		const base64 = (base64String + padding)
			.replace(/-/g, "+")
			.replace(/_/g, "/")
		const rawData = atob(base64)
		const outputArray = new Uint8Array(rawData.length)
		for (let i = 0; i < rawData.length; ++i) {
			outputArray[i] = rawData.charCodeAt(i)
		}
		return outputArray
	}

	function pushIsSupported() {
		return (
			typeof navigator !== "undefined" &&
			"serviceWorker" in navigator &&
			typeof window !== "undefined" &&
			"PushManager" in window
		)
	}

	async function loadPushSubscription() {
		if (!pushIsSupported()) {
			pushSubscription.value = null
			return null
		}
		try {
			const registration = await navigator.serviceWorker.ready
			const sub = await registration.pushManager.getSubscription()
			pushSubscription.value = sub ? sub.toJSON() : null
			return sub
		} catch (err) {
			console.warn("loadPushSubscription failed", err)
			pushSubscription.value = null
			return null
		}
	}

	async function ensurePushSubscription(deviceFingerprint = null) {
		const existing = await loadPushSubscription()

		if (!existing) {
			if (
				typeof Notification === "undefined" ||
				Notification.permission !== "granted"
			) {
				return null
			}
			if (!pushEnv.enabled || !pushEnv.vapidPublicKey) {
				return null
			}

			try {
				return await subscribeToPush(deviceFingerprint)
			} catch (err) {
				console.warn("auto re-subscribe failed", err)
				return null
			}
		}

		reconcileWithServer(deviceFingerprint, existing).catch(() => {})

		return existing
	}

	function scheduleIdle(fn) {
		if (
			typeof window !== "undefined" &&
			typeof window.requestIdleCallback === "function"
		) {
			window.requestIdleCallback(fn, { timeout: 2000 })
		} else {
			setTimeout(fn, 500)
		}
	}

	async function reconcileWithServer(deviceFingerprint, browserSub) {
		if (!browserSub?.endpoint) return

		scheduleIdle(async () => {
			try {
				const params = { endpoint: browserSub.endpoint }
				if (deviceFingerprint) {
					params.device_fingerprint = deviceFingerprint
				}
				const body = await apiGet("/push/status", params)
				if (body?.endpoint_registered) return
				await subscribeToPush(deviceFingerprint)
			} catch (err) {
				console.warn("push reconcile failed", err)
			}
		})
	}

	let inflightSubscribe = null

	async function subscribeToPush(deviceFingerprint = null) {
		if (inflightSubscribe) {
			return inflightSubscribe
		}

		inflightSubscribe = (async () => {
			if (!pushIsSupported()) {
				throw new Error("Push notifications not supported in this browser")
			}
			const vapidKey = pushEnv.vapidPublicKey
			if (!vapidKey) {
				throw new Error("VAPID public key not configured")
			}

			const registration = await navigator.serviceWorker.ready
			let sub = await registration.pushManager.getSubscription()
			if (!sub) {
				sub = await registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: urlBase64ToUint8Array(vapidKey),
				})
			}

			const payload = sub.toJSON()
			try {
				await apiClient.post("/push/subscribe", {
					endpoint: payload.endpoint,
					keys: payload.keys,
					device_fingerprint: deviceFingerprint,
					expires_at: sub.expirationTime
						? new Date(sub.expirationTime).toISOString()
						: null,
				})
			} catch (err) {
				// Roll back the browser subscription if the server rejected it.
				await sub.unsubscribe()
				const status = err.response?.status
				const body = err.response?.data
					? JSON.stringify(err.response.data)
					: err.message
				throw new Error(`Subscribe failed: ${status ?? ""} ${body}`)
			}

			pushSubscription.value = payload
			return payload
		})().finally(() => {
			inflightSubscribe = null
		})

		return inflightSubscribe
	}

	async function unsubscribeFromPush() {
		if (!pushIsSupported()) return
		try {
			const registration = await navigator.serviceWorker.ready
			const sub = await registration.pushManager.getSubscription()
			if (!sub) {
				pushSubscription.value = null
				return
			}
			const endpoint = sub.endpoint
			await sub.unsubscribe()
			await apiClient.delete("/push/unsubscribe", {
				data: { endpoint },
			})
			pushSubscription.value = null
		} catch (err) {
			console.warn("unsubscribeFromPush failed", err)
		}
	}

	if (typeof navigator !== "undefined" && navigator.serviceWorker) {
		navigator.serviceWorker.addEventListener("message", (event) => {
			if (event.data?.type === "pushsubscriptionchange") {
				subscribeToPush().catch((err) =>
					console.warn("re-subscribe after change failed", err),
				)
			}
		})
	}

	/**
	 * Load configuration from app-manifest.json
	 * Maps manifest keys to store properties:
	 * - settings -> pluginVars
	 * - strings.default -> stringsList
	 * - assets -> assetList
	 * - staticAssets -> staticAssetList
	 * - dependencies -> dependencies + dependencyList
	 * - permissions -> permissionFlags
	 * - navigationFlags -> navigationFlagsKeyed
	 * - triggerState -> triggerState
	 * - user / auth / userSession / portal -> session data
	 * - form -> store.form
	 */
	async function loadManifest() {
		try {
			const response = await fetch("/app-manifest.json")
			if (!response.ok) {
				if (response.status === 404) {
					console.log("[GxP Store] No app-manifest.json found, using defaults")
					manifestLoaded.value = true
					return
				}
				throw new Error(`HTTP ${response.status}`)
			}

			const manifest = await response.json()
			applyManifest(manifest)
			manifestLoaded.value = true
			manifestError.value = null
			console.log("[GxP Store] Loaded configuration from app-manifest.json")

			// Re-initialize dependency sockets after manifest loads
			initializeDependencySockets()
			initializeContextSockets()
		} catch (error) {
			console.warn(
				"[GxP Store] Could not load app-manifest.json:",
				error.message,
			)
			manifestError.value = error.message
			manifestLoaded.value = true
		}
	}

	/**
	 * Apply manifest data to store
	 */
	function applyManifest(manifest) {
		if (manifest.settings && typeof manifest.settings === "object") {
			pluginVars.value = { ...defaultData.pluginVars, ...manifest.settings }
			applyApiPluginVars()
		}

		// Handle strings - can be { default: {...} } or flat object
		if (manifest.strings) {
			if (
				manifest.strings.default &&
				typeof manifest.strings.default === "object"
			) {
				stringsList.value = { ...manifest.strings.default }
			} else if (typeof manifest.strings === "object") {
				stringsList.value = { ...manifest.strings }
			}
		}

		if (manifest.assets && typeof manifest.assets === "object") {
			assetList.value = { ...manifest.assets }
		}

		if (manifest.staticAssets && typeof manifest.staticAssets === "object") {
			staticAssetList.value = { ...manifest.staticAssets }
		}

		if (manifest.dependencies && Array.isArray(manifest.dependencies)) {
			dependencies.value = manifest.dependencies // Store full dependency objects
			// Mock a binding for every dependency_list key token. Literal scope
			// tokens (`*`, `#<tag>`, `@untagged`, `@<permissionKey>` parent refs)
			// are not binding keys and never appear in dependency_list.
			dependencyList.value = manifest.dependencies.reduce((acc, dep) => {
				const tokens =
					dep.identifier !== undefined
						? [dep.identifier]
						: Array.isArray(dep.identifiers)
							? dep.identifiers
							: []
				for (const token of tokens) {
					if (
						typeof token === "string" &&
						token !== "*" &&
						!token.startsWith("#") &&
						!token.startsWith("@")
					) {
						acc[token] = "1"
					}
				}
				return acc
			}, {})
			console.log("[GxP Store] Dependency List:", dependencyList.value)
		}

		if (manifest.permissions && Array.isArray(manifest.permissions)) {
			permissionFlags.value = [...manifest.permissions]
		}

		if (
			manifest.navigationFlags &&
			typeof manifest.navigationFlags === "object" &&
			!Array.isArray(manifest.navigationFlags)
		) {
			navigationFlagsKeyed.value = { ...manifest.navigationFlags }
		}

		if (manifest.triggerState && typeof manifest.triggerState === "object") {
			triggerState.value = { ...manifest.triggerState }
		}

		// Session data. `user` is the ergonomic dev form; `auth` is the full
		// platform object ({ user, ... }). Either may be `null` to simulate a
		// guest. `auth` wins when both are present.
		if (manifest.auth !== undefined) {
			auth.value = manifest.auth ? { ...manifest.auth } : null
		} else if (manifest.user !== undefined) {
			user.value = manifest.user ? { ...manifest.user } : null
		}
		if (manifest.userSession !== undefined) {
			userSession.value = manifest.userSession
		}
		if (manifest.portal !== undefined) {
			portal.value = manifest.portal ? { ...manifest.portal } : null
		}
		if (manifest.portalAssets && typeof manifest.portalAssets === "object") {
			portalAssets.value = { ...manifest.portalAssets }
		}

		applyFormSection(manifest)
	}

	/**
	 * Attach and initialize the form store from the manifest's `form`
	 * section (or settings.formId). Like the other manifest-managed
	 * sections, the form store is rebuilt on every manifest (re)load —
	 * schema edits hot-reload, and unsaved formData is reset.
	 */
	function applyFormSection(manifest) {
		const formConfig =
			manifest.form && typeof manifest.form === "object" ? manifest.form : null
		const formId =
			formConfig?.formId ??
			formConfig?.slug ??
			manifest.settings?.formId ??
			null

		if (!formConfig && !formId) {
			return
		}

		const formKey = formId ?? "dev-form"
		pluginVars.value.formId = formKey

		if (form.value?.slug && form.value.slug !== formKey) {
			disposeGxpFormStore(form.value.slug)
		} else {
			disposeGxpFormStore(formKey)
		}

		const formStore = attachFormStore(formKey)
		formStore.initialize({
			formId: formKey,
			...(formConfig ?? {}),
			customSettings: pluginVars.value,
		})
		console.log(`[GxP Store] Form store attached as store.form (${formKey})`)
	}

	/**
	 * Populate the store from a platform-shaped payload. This is what the
	 * platform's page component calls; the dev server normally uses the
	 * manifest instead, but exposing it lets harnesses and tests seed the
	 * store identically in both environments.
	 */
	async function initializeData(initialData) {
		pluginVars.value = { ...(initialData.pluginVars ?? {}) }
		stringsList.value = initialData.stringsList ?? {}
		assetList.value = initialData.assetList ?? {}
		staticAssetList.value =
			initialData.staticAssetList ?? staticAssetList.value ?? {}
		dependencyList.value = initialData.dependencyList ?? {}
		dependencies.value = initialData.dependencies || []
		permissionFlags.value = initialData.permissionFlags ?? []
		navigationFlagsKeyed.value =
			initialData.navigationFlagsKeyed &&
			!Array.isArray(initialData.navigationFlagsKeyed)
				? initialData.navigationFlagsKeyed
				: {}
		auth.value = initialData.auth ?? null
		userSession.value = initialData.userSession ?? null
		portalAssets.value = initialData.portalAssets ?? {}
		pageId.value = initialData.pageId ?? null
		portal.value = initialData.portal ?? null
		if (initialData.apiBaseUrl) {
			apiBaseUrl.value = initialData.apiBaseUrl
			pluginVars.value.apiBaseUrl = initialData.apiBaseUrl
		}
		if (initialData.authToken !== undefined) {
			authToken.value = initialData.authToken
			pluginVars.value.apiPageAuthId = initialData.authToken
		}
		pageToken.value = initialData.pageToken ?? authToken.value
		applyApiPluginVars()
		logout.value = initialData.logout ?? null
		triggerState.value = initialData.triggerState ?? {}

		// Form-backed pages: expose the form store as gxpStore.form so
		// plugin authors don't need to import another store.
		const vars = initialData.pluginVars || {}
		if (vars.formId) {
			const formStore = attachFormStore(vars.formId)
			if (!formStore.isInitialized) {
				formStore.initialize({
					formId: vars.formId,
					slug: vars.slug,
					form: vars.form,
					schema: vars.schema,
					formSchema: vars.formSchema,
					settings: vars.settings ?? vars.formSettings,
					strings: vars.strings ?? vars.formStrings,
					registrationMode: vars.registrationMode,
					isAuthenticated: vars.isAuthenticated,
					resumeSession: vars.resumeSession ?? null,
					prefillData: vars.prefillData,
					attendee: vars.attendee,
					customSettings: vars,
				})
			}
		}

		// Initialize API operations registry from OpenAPI spec
		await initializeApiOperations()
	}

	// --- Sockets ------------------------------------------------------------
	//
	// The platform multiplexes several Echo channels (page, project, portal,
	// attendee, per-dependency). The dev server has one Socket.IO relay that
	// rebroadcasts every event to every other client, so all of those
	// "channels" share one wire here. Each socket object still exposes the
	// platform's methods, and — as on the platform — every `listen*` returns
	// an unsubscribe closure; there are no `stopListening*` methods.

	function makeSocketFacade(primarySocket, { stateChangeEvent } = {}) {
		const listen = function (event, callback) {
			primarySocket.on(event, callback)
			return () => primarySocket.off(event, callback)
		}
		const facade = {
			broadcast: function (event, data) {
				primarySocket.emit(event, data)
			},
			listen,
			listenForWhisper: listen,
		}
		if (stateChangeEvent) {
			facade.listenForStateChange = function (callback) {
				// Mirror the platform: apply `changes` to triggerState before
				// handing the event to the caller.
				const wrapped = (e) => {
					if (e && typeof e === "object" && e.changes) {
						triggerState.value = {
							...triggerState.value,
							...e.changes,
						}
					}
					return callback(e)
				}
				primarySocket.on(stateChangeEvent, wrapped)
				return () => primarySocket.off(stateChangeEvent, wrapped)
			}
		}
		return facade
	}

	function bindConnectionStatus(socket) {
		connectionStatus.value = socket.connected ? "connected" : "connecting"
		socket.on("connect", () => {
			connectionStatus.value = "connected"
		})
		socket.on("disconnect", () => {
			connectionStatus.value = "disconnected"
		})
		socket.on("connect_error", () => {
			connectionStatus.value = "unavailable"
		})
		socket.io?.on?.("reconnect_attempt", () => {
			connectionStatus.value = "connecting"
		})
	}

	function clearSockets() {
		for (const key of Object.keys(sockets)) delete sockets[key]
	}

	/**
	 * Initialize primary WebSocket connection
	 * Called synchronously when store is created; calling it again tears the
	 * existing connection down first (same guard as the platform).
	 *
	 * Controlled by env vars:
	 *   SOCKET_DRIVER = "io" (default) | "echo" | "false"
	 *   SOCKET_URL    = explicit socket server URL (overrides auto-detected default)
	 */
	function initializeSockets() {
		if (socketConnections.primary) {
			socketConnections.primary.disconnect()
			delete socketConnections.primary
			clearSockets()
			connectionStatus.value = "disconnected"
		}

		const socketDriver = import.meta.env.SOCKET_DRIVER || "io"

		if (socketDriver !== "io") {
			if (socketDriver === "echo") {
				console.warn(
					"[GxP Store] Echo driver selected — configure Echo externally via socketConnections.primary",
				)
			} else {
				console.log(
					`[GxP Store] Sockets disabled (SOCKET_DRIVER=${socketDriver})`,
				)
			}
			setIsLoaded(true)
			return
		}

		// Resolve socket URL — explicit env var takes priority over auto-detected default
		const socketUrl = (() => {
			if (import.meta.env.SOCKET_URL) {
				return import.meta.env.SOCKET_URL
			}
			const protocol =
				typeof window !== "undefined" && window.location.protocol === "https:"
					? "https"
					: "http"
			const port = import.meta.env.VITE_SOCKET_IO_PORT || 3069
			return `${protocol}://localhost:${port}`
		})()

		console.log(`[GxP Store] Connecting via Socket.IO to ${socketUrl}`)
		// markRaw: the socket is a stateful client, not data — keep Vue from
		// proxying it (and hand plugins the real object via quiz `echo`).
		const primarySocket = markRaw(io(socketUrl))
		socketConnections.primary = primarySocket
		bindConnectionStatus(primarySocket)

		// --- Primary socket (platform: portal.pages.{pageId}) ---
		sockets.primary = makeSocketFacade(primarySocket, {
			stateChangeEvent: "state-change",
		})

		initializeContextSockets()
		initializeDependencySockets()
		setIsLoaded(true)
	}

	/**
	 * Project / portal / attendee sockets. On the platform these exist when
	 * the page has a portal context and a logged-in attendee; here they are
	 * built from `portal` and `auth.user` (manifest-provided) over the same
	 * relay connection.
	 */
	function initializeContextSockets() {
		const primarySocket = socketConnections.primary
		if (!primarySocket) return

		delete sockets.project
		delete sockets.portal
		delete sockets.attendee

		if (portal.value?.project_slug) {
			sockets.project = makeSocketFacade(primarySocket)
			sockets.portal = makeSocketFacade(primarySocket)
		}

		// Attendee notification inbox (EZ-2954). Platform event name is
		// Laravel's BroadcastNotificationCreated; the relay carries it as a
		// plain "notification" event (`gxdev socket send notification ...`).
		if (auth.value?.user?.id) {
			const attendeeNotification = function (callback) {
				primarySocket.on("notification", callback)
				return () => primarySocket.off("notification", callback)
			}
			sockets.attendee = {
				notification: attendeeNotification,
				listen: (_event, callback) => attendeeNotification(callback),
			}
		}
	}

	/**
	 * Initialize dependency-based sockets
	 * Called after manifest loads to set up dependency-specific listeners
	 */
	function initializeDependencySockets() {
		const primarySocket = socketConnections.primary
		if (!primarySocket) return

		const makeEventSocket = (eventName, channel) => ({
			listen: function (callback) {
				const handler = (data) => {
					console.log(`Socket event received: ${eventName} on ${channel}`, data)
					callback(data)
				}
				primarySocket.on(eventName, handler)
				return () => primarySocket.off(eventName, handler)
			},
		})
		const noopSocket = () => ({ listen: () => () => {} })

		const bind = (permission, identifier) => {
			if (permission.events && Object.keys(permission.events).length > 0) {
				sockets[identifier] = {}
				for (const eventType of Object.keys(permission.events)) {
					const eventName = permission.events[eventType]
					const channel = `private.${permission.model}.${identifier}`
					sockets[identifier][eventType] = makeEventSocket(eventName, channel)
				}
			} else {
				// For dependencies without events, create empty listeners
				sockets[identifier] = {
					created: noopSocket(),
					updated: noopSocket(),
					deleted: noopSocket(),
				}
			}
		}

		if (Array.isArray(dependencies.value)) {
			for (const permission of dependencies.value) {
				if (permission.identifier) {
					bind(permission, permission.identifier)
				} else if (Array.isArray(permission.identifiers)) {
					for (const identifier of permission.identifiers) {
						bind(permission, identifier)
					}
				}
			}
		}
	}

	/**
	 * Initialize API operations registry from OpenAPI spec
	 */
	async function initializeApiOperations() {
		// Operations are built from OpenAPI spec paths
		// Structure: { [operationId]: { method, path, parameters } }
		try {
			const specUrl = `${apiDocsBaseUrl.value}/api-specs/openapi.json`
			const response = await axios.get(specUrl)
			const spec = response.data

			const operations = {}
			const httpMethods = ["get", "post", "put", "patch", "delete"]

			// Parse paths from OpenAPI spec
			if (spec.paths) {
				for (const [path, pathItem] of Object.entries(spec.paths)) {
					for (const method of httpMethods) {
						if (pathItem[method] && pathItem[method].operationId) {
							const operation = pathItem[method]
							const operationId = operation.operationId

							// Extract path parameters from the path string
							const pathParams = []
							const paramMatches = path.matchAll(/\{([^}]+)\}/g)
							for (const match of paramMatches) {
								pathParams.push(match[1])
							}

							operations[operationId] = {
								method,
								path,
								parameters: pathParams,
							}
						}
					}
				}
			}

			apiOperations.value = operations
			console.log(
				`Loaded ${Object.keys(operations).length} API operations from OpenAPI spec`,
			)
		} catch (error) {
			console.error("Failed to load OpenAPI spec:", error.message)
			// Initialize with empty operations on failure
			apiOperations.value = {}
		}
	}

	// API methods for common operations. Endpoints are resolved against the
	// API host, so — as on the platform — pass the full path including the
	// "/api" segment (e.g. apiGet("/api/v1/projects/...")).
	async function apiGet(endpoint, params = {}) {
		try {
			const response = await apiClient.get(endpoint, { params })
			return response.data
		} catch (error) {
			throw new Error(`GET ${endpoint}: ${error.message}`)
		}
	}

	async function apiPost(endpoint, data = {}) {
		try {
			const response = await apiClient.post(endpoint, data)
			return response.data
		} catch (error) {
			throw new Error(`POST ${endpoint}: ${error.message}`)
		}
	}

	async function apiPut(endpoint, data = {}) {
		try {
			const response = await apiClient.put(endpoint, data)
			return response.data
		} catch (error) {
			throw new Error(`PUT ${endpoint}: ${error.message}`)
		}
	}

	// Dev-only: the platform store does not expose apiPatch.
	async function apiPatch(endpoint, data = {}) {
		try {
			const response = await apiClient.patch(endpoint, data)
			return response.data
		} catch (error) {
			throw new Error(`PATCH ${endpoint}: ${error.message}`)
		}
	}

	async function apiDelete(endpoint) {
		try {
			const response = await apiClient.delete(endpoint)
			return response.data
		} catch (error) {
			throw new Error(`DELETE ${endpoint}: ${error.message}`)
		}
	}

	/**
	 * Resolve a page dependency by identifier into parsed { ids, tags,
	 * untagged }. Used by data-scoped API callers to build filters.
	 */
	function resolveDependency(identifier) {
		return parseDependencyValue(dependencyList.value?.[identifier])
	}

	/**
	 * Call an API operation using its OpenAPI operationId
	 *
	 * @param {string} operationId - The operationId from OpenAPI spec (e.g., 'portal.v1.project.quiz.state')
	 * @param {string|null} identifier - Key to look up parent object ID from dependencyList.
	 *                                   Set to null when API only requires team/project context.
	 * @param {object} data - Additional path parameters and request body data.
	 *                        A FormData instance, or an object containing Blob/File
	 *                        values, is sent as multipart/form-data.
	 * @returns {Promise<any>} - API response data
	 */
	async function callApi(operationId, identifier, data = {}) {
		// Initialize operations if not done
		if (Object.keys(apiOperations.value).length === 0) {
			await initializeApiOperations()
		}

		let operationConfig = apiOperations.value[operationId]
		if (!operationConfig) {
			operationConfig = apiOperations.value["portal.v1.project." + operationId]
			if (!operationConfig) {
				throw new Error(`Operation not found: portal.v1.${operationId}`)
			}
		}

		const { method, path, parameters } = operationConfig

		// Build the URL by substituting path parameters
		let resolvedPath = path

		// Build context parameters from multiple sources:
		// 1. Auto-inject teamSlug and projectSlug from portal context
		// 2. Look up identifier value from dependencyList (if identifier provided)
		// 3. Merge in additional data parameters
		let projectTeamId = pluginVars.value?.projectId?.split("/")
		if (!projectTeamId || projectTeamId.length !== 2) {
			console.log(
				`[GxP Store] Invalid projectId "${pluginVars.value?.projectId}", expected "teamSlug/projectSlug" (set API_PROJECT_ID)`,
			)
			return []
		}
		let teamSlug = projectTeamId[0]
		let projectSlug = projectTeamId[1]
		const contextParams = {
			teamSlug: teamSlug,
			projectSlug: projectSlug,
		}
		if (parameters.includes("form") && pluginVars.value?.formId) {
			contextParams["form"] = pluginVars.value?.formId
		}
		// If identifier is provided, look up its value from dependencyList
		// dependencyList stores parent object IDs as { 'identifier': idValue }
		if (identifier !== null && identifier !== undefined) {
			const identifierValue = dependencyList.value?.[identifier]
			if (identifierValue !== undefined) {
				// dependencyList values may be mixed arrays ([id, "#tag",
				// "@untagged"]); a path param needs a scalar. Use the parsed model
				// ids (CSV) and leave the param unset for tag-only bindings so the
				// loop below raises a clear missing-param error.
				if (Array.isArray(identifierValue)) {
					const { ids } = parseDependencyValue(identifierValue)
					if (ids.length) {
						contextParams[identifier] = ids.join(",")
					}
				} else {
					contextParams[identifier] = identifierValue
				}
			}
		}
		const parsedData = {}
		for (const key in data) {
			if (data[key] !== undefined && data[key] !== null) {
				if (data[key].toString().startsWith("pluginVars")) {
					const pluginVarKey = data[key].split(".")[1]

					parsedData[key] = pluginVars.value[pluginVarKey]
					continue
				}
				parsedData[key] = data[key]
			}
		}

		// Merge in additional data (can override dependencyList values if needed)
		Object.assign(contextParams, parsedData)

		// Replace path parameters
		for (const param of parameters) {
			const value = contextParams[param]
			if (value === undefined || value === null) {
				throw new Error(
					`Missing required parameter: ${param} for operation ${operationId}`,
				)
			}
			resolvedPath = resolvedPath.replace(
				`{${param}}`,
				encodeURIComponent(value),
			)
		}

		// Separate path params from body data
		const bodyData = { ...parsedData }
		for (const param of parameters) {
			delete bodyData[param]
		}
		// Also remove identifier from body if it was in data
		if (identifier && bodyData[identifier] !== undefined) {
			delete bodyData[identifier]
		}

		// OpenAPI paths are relative to the API root ("/v1/..."); the API
		// itself lives under "/api" on every host — same prefix the platform
		// store applies against the portal origin.
		const requestPath = "/api" + resolvedPath

		try {
			let response
			if (method === "get" || method === "delete") {
				// GET/DELETE: params go in query string
				response = await apiClient[method](requestPath, {
					params: bodyData,
				})
			} else if (dataNeedsMultipart(data)) {
				// Multipart branch: apiClient's default `Content-Type:
				// application/json` would cause axios to JSON-stringify the
				// body (Blobs serialize to "{}"), and prevents the browser
				// from auto-setting the multipart boundary. Bypass it with
				// bare axios and re-add the auth headers manually.
				if (!["post", "put", "patch"].includes(method)) {
					throw new Error(
						`callApi: multipart not supported for ${method.toUpperCase()} ${operationId}`,
					)
				}
				const body = data instanceof FormData ? data : buildFormData(bodyData)
				response = await axios[method](
					`${apiBaseUrl.value}${requestPath}`,
					body,
					{
						timeout: 30000,
						headers: authHeaders(),
					},
				)
			} else {
				// POST/PUT/PATCH: params go in body
				response = await apiClient[method](requestPath, bodyData)
			}
			return response.data
		} catch (error) {
			const message =
				error.response?.data?.message ||
				error.response?.data?.error ||
				error.message
			console.error(
				`API Error [${operationId}]:`,
				message,
				error.response?.data,
			)
			throw new Error(`${method.toUpperCase()} ${resolvedPath}: ${message}`)
		}
	}

	// Utility methods — nullish semantics like the platform: an explicit
	// `false`, `0` or `""` is a real value, only null/undefined fall back.
	function getString(key, fallback = "") {
		return stringsList.value[key] ?? fallback
	}

	function getSetting(key, fallback = null) {
		return pluginVars.value[key] ?? fallback
	}

	function getAsset(key, fallback = "") {
		let assetUrl = assetList.value[key] || staticAssetList.value[key]
		if (!assetUrl) {
			if (fallback.includes("/")) {
				key = fallback.split("/").pop() //last segment of the path
			} else {
				key = fallback
			}
			assetUrl = assetList.value[key] || staticAssetList.value[key] || fallback
		}
		return assetUrl
	}

	function findDependency(identifier) {
		return dependencyList.value[identifier]
	}

	function getState(key, fallback = null) {
		return triggerState.value[key] ?? fallback
	}

	function hasPermission(flag) {
		return permissionFlags.value.includes(flag)
	}

	/**
	 * The groups the logged-in attendee belongs to (EZ-3006). In dev, seed
	 * them via the manifest: `"user": { ..., "groups": [{ "name", "slug" }] }`.
	 *
	 * @returns {Array<{name: string, slug: string}>}
	 */
	function getGroups() {
		return auth.value?.user?.groups ?? []
	}

	function getGroupNames() {
		return getGroups().map((group) => group.name)
	}

	function getGroupSlugs() {
		return getGroups().map((group) => group.slug)
	}

	function inGroup(slug) {
		return getGroups().some((group) => group.slug === slug)
	}

	/**
	 * @param {string|Array<string>} slugs one slug or a list of them
	 */
	function inAnyGroup(slugs) {
		const wanted = Array.isArray(slugs) ? slugs : [slugs]
		return getGroups().some((group) => wanted.includes(group.slug))
	}

	// --- Dev-only user helpers (not on the platform; read auth.user there) ---
	function getUser() {
		return user.value ?? null
	}

	function isAuthenticated() {
		return user.value !== null && user.value !== undefined
	}

	function getUserName(fallback = null) {
		const u = user.value
		if (!u) {
			return fallback
		}
		if (u.name) {
			return u.name
		}
		const parts = [u.first_name, u.last_name].filter(Boolean)
		return parts.length > 0 ? parts.join(" ") : fallback
	}

	function getUserEmail(fallback = null) {
		return user.value?.email ?? fallback
	}

	// Theme configuration — same keys and defaults as the platform, derived
	// from settings so a plugin's theme handling behaves identically.
	const theme = computed(() => ({
		background_color: getSetting("background_color", "#ffffff"),
		text_color: getSetting("text_color", "#333333"),
		primary_color: getSetting("primary_color", "#FFD600"),
		start_background_color: getSetting(
			"start_background_color",
			"linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
		),
		start_text_color: getSetting("start_text_color", "#ffffff"),
		final_background_color: getSetting("final_background_color", "#4CAF50"),
		final_text_color: getSetting("final_text_color", "#ffffff"),
	}))

	// Configuration update methods (for development)
	function updatePluginVar(key, value) {
		pluginVars.value[key] = value
	}

	function updateString(key, value) {
		stringsList.value[key] = value
	}

	function updateAsset(key, value) {
		assetList.value[key] = value
	}

	// Dev-only aliases used by the DevTools store inspector.
	function updateSetting(key, value) {
		updatePluginVar(key, value)
	}

	function updateState(key, value) {
		triggerState.value = { ...triggerState.value, [key]: value }
	}

	function addDevAsset(key, filename) {
		const appProtocol =
			typeof window !== "undefined" && window.location.protocol === "https:"
				? "https"
				: "http"
		const appPort =
			typeof window !== "undefined" ? window.location.port || 3000 : 3000
		const url = `${appProtocol}://localhost:${appPort}/dev-assets/images/${filename}`
		assetList.value[key] = url
	}

	function listAssets() {
		console.log("📁 Current Assets:")
		for (const [key, url] of Object.entries(assetList.value)) {
			console.log(`   ${key}: ${url}`)
		}
		return assetList.value
	}

	const setIsLoaded = (value) => {
		isLoaded.value = value
	}

	const reset = () => {
		if (socketConnections.primary) {
			socketConnections.primary.disconnect()
			delete socketConnections.primary
		}
		connectionStatus.value = "disconnected"
		clearSockets()
		for (const key of Object.keys(quizChannels)) delete quizChannels[key]

		isLoaded.value = false
		pluginVars.value = {}
		stringsList.value = {}
		assetList.value = {}
		staticAssetList.value = {}
		dependencyList.value = {}
		dependencies.value = []
		permissionFlags.value = []
		navigationFlagsKeyed.value = {}
		auth.value = null
		userSession.value = null
		portalAssets.value = {}
		portal.value = null
		pageId.value = null
		form.value = null
	}

	const destroy = () => {
		reset()
		if (typeof window !== "undefined") {
			window.removeEventListener("online", handleOnline)
			window.removeEventListener("offline", handleOffline)
		}
	}

	// Quiz channel helpers for live quiz mode. The platform returns
	// { channel, echo, leave } where `channel` is an Echo private channel;
	// here `channel` is an Echo-shaped facade over the relay connection and
	// `echo` is the underlying Socket.IO socket.
	function connectQuizChannel(formId) {
		if (quizChannels[formId]) {
			return quizChannels[formId]
		}

		const primarySocket = socketConnections.primary
		if (!primarySocket) {
			console.warn(
				"[GxP Store] connectQuizChannel(): primary socket not initialized",
			)
			return null
		}

		const channelName = `quiz.${formId}`
		const channel = {
			name: channelName,
			listen(event, callback) {
				primarySocket.on(event, callback)
				return channel
			},
			stopListening(event, callback) {
				primarySocket.off(event, callback)
				return channel
			},
			listenForWhisper(event, callback) {
				primarySocket.on(event, callback)
				return channel
			},
			stopListeningForWhisper(event, callback) {
				primarySocket.off(event, callback)
				return channel
			},
			whisper(event, data) {
				primarySocket.emit(event, data)
				return channel
			},
			notification(callback) {
				primarySocket.on("notification", callback)
				return channel
			},
		}

		quizChannels[formId] = {
			channel,
			echo: primarySocket,
			leave: () => {
				delete quizChannels[formId]
			},
		}

		return quizChannels[formId]
	}

	function leaveQuizChannel(formId) {
		if (quizChannels[formId]) {
			quizChannels[formId].leave()
		}
	}

	async function resyncQuizState(formId) {
		return await callApi("portal.v1.project.quiz.state", "form", {
			form: formId,
		})
	}

	// Standard Socket helper methods
	//
	// Polymorphic — supports two forms:
	//
	//   1. listen(socketName, event, callback)      — platform form
	//      Subscribes to `event` on the named socket (e.g. 'primary' or a
	//      dependency identifier whose socket was initialized via
	//      initializeDependencySockets).
	//
	//   2. listen(eventName, permissionIdentifier, callback)   — dev extra
	//      Subscribes to an AsyncAPI-defined platform event on the primary
	//      socket, scoped to a permission identifier from dependencyList
	//      (or the reserved "project" identifier). Use this for events whose
	//      `x-triggered-by` matches a callApi operationId.
	//
	// Disambiguation: if arg1 names a registered socket we take form 1,
	// otherwise we fall through to form 2. Both return an unsubscribe closure.
	function listen(arg1, arg2, arg3) {
		const hasRegisteredSocket =
			sockets[arg1] && typeof sockets[arg1].listen === "function"

		if (hasRegisteredSocket && typeof arg3 === "function") {
			return sockets[arg1].listen(arg2, arg3)
		}

		if (typeof arg3 === "function") {
			const eventName = arg1
			const permissionIdentifier = arg2
			const callback = arg3
			const primary = socketConnections.primary
			if (!primary) {
				console.warn("[GxP Store] listen(): primary socket not initialized")
				return () => {}
			}
			if (
				permissionIdentifier !== "project" &&
				dependencyList.value?.[permissionIdentifier] === undefined
			) {
				console.warn(
					`[GxP Store] listen("${eventName}", "${permissionIdentifier}"): permission identifier not bound in dependencyList`,
				)
			}
			const handler = (data) => {
				try {
					callback(data)
				} catch (err) {
					console.error(
						`[GxP Store] listen callback error for ${eventName}:`,
						err,
					)
				}
			}
			primary.on(eventName, handler)
			return () => primary.off(eventName, handler)
		}

		console.warn(`Socket not found: ${arg1}`)
		return () => {}
	}

	function broadcast(socketName, event, data) {
		try {
			if (sockets[socketName] && sockets[socketName].broadcast) {
				sockets[socketName].broadcast(event, data)
			} else {
				console.warn(`Socket not found: ${socketName}`)
			}
			return true
		} catch (error) {
			console.error(`Error broadcasting on socket ${socketName}:`, error)
			return false
		}
	}

	// deprecated helpers: maintain legacy support
	function emitSocket(socketName, event, data) {
		return broadcast(socketName, event, data)
	}

	function listenSocket(socketName, event, callback) {
		return listen(socketName, event, callback)
	}

	function useSocketListener(socketName, event, callback) {
		return listen(socketName, event, callback)
	}

	// Initialize sockets SYNCHRONOUSLY when store is created
	// This ensures sockets is available immediately
	initializeSockets()
	initializeApiOperations()
	// Load manifest ASYNCHRONOUSLY in the background
	// This allows the store to be used immediately while manifest loads
	loadManifest()

	// Setup Vite HMR for app-manifest.json hot-reload
	if (import.meta.hot) {
		// Listen for custom HMR event from Vite plugin
		import.meta.hot.on("gxp:manifest-update", (data) => {
			console.log("[GxP Store] Hot-reloading app-manifest.json")
			applyManifest(data)
			initializeDependencySockets()
			initializeContextSockets()
		})

		// Also support full-reload trigger if needed
		import.meta.hot.on("gxp:manifest-reload", () => {
			console.log("[GxP Store] Reloading app-manifest.json")
			loadManifest()
		})
	}

	return {
		// State (platform)
		pluginVars,
		stringsList,
		assetList,
		staticAssetList,
		dependencyList,
		permissionFlags,
		navigationFlagsKeyed,
		auth,
		userSession,
		portalAssets,
		portal,
		sockets,
		connectionStatus,
		isOnline,
		quizChannels,
		theme,
		triggerState,
		form,
		attachFormStore,

		// State (dev-only)
		user,
		pluginData,
		manifestLoaded,
		manifestError,

		// API methods (platform)
		apiGet,
		apiPost,
		apiPut,
		apiDelete,
		callApi,
		resolveDependency,
		initializeApiOperations,
		apiOperations,
		// API methods (dev-only)
		apiPatch,

		// Utility methods (platform)
		getString,
		getSetting,
		getAsset,
		getState,
		hasPermission,
		findDependency,
		getGroups,
		getGroupNames,
		getGroupSlugs,
		inGroup,
		inAnyGroup,
		// Utility methods (dev-only)
		getUser,
		getUserName,
		getUserEmail,
		isAuthenticated,

		// Socket methods (platform)
		connectQuizChannel,
		leaveQuizChannel,
		resyncQuizState,
		emitSocket,
		listenSocket,
		listen,
		broadcast,
		useSocketListener,

		// Web Push (platform)
		pushSubscription,
		loadPushSubscription,
		ensurePushSubscription,
		subscribeToPush,
		unsubscribeFromPush,

		// Development methods (platform)
		updatePluginVar,
		updateString,
		updateAsset,
		addDevAsset,
		listAssets,
		initializeData,
		initializeSockets,
		reset,
		destroy,
		// Development methods (dev-only)
		updateSetting,
		updateState,
		loadManifest,
		applyManifest,
	}
})

/**
 * Resolve the GxP store.
 *
 * The platform's `useGxpStore(storeId?)` keys one store per plugin page and
 * resolves the id via provide/inject. The dev server hosts a single plugin,
 * so there is exactly one store; the optional id is accepted for
 * call-compatibility and ignored.
 */
export const useGxpStore = (_storeId) => useGxpStoreDefinition()

/** Platform-compat: with a single dev store every id resolves to it. */
export const getGxpStoreById = (_storeId) => useGxpStore()

/** Platform-compat: tear the dev store down. */
export const disposeGxpStore = (_storeId) => {
	const store = useGxpStore()
	store.destroy()
	store.$dispose?.()
}

/** Platform-compat no-op: the dev server has no page store to switch to. */
export const setDefaultPageStoreId = (_storeId) => {}
