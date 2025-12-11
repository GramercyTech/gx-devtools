import { defineStore } from "pinia";
import { ref, computed, reactive } from "vue";
import axios from "axios";
import { io } from "socket.io-client";

// Environment URL configuration (matches constants.js ENVIRONMENT_URLS)
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
};

/**
 * Generate a random bearer token for mock API
 */
function generateMockToken() {
	const chars =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let token = "";
	for (let i = 0; i < 32; i++) {
		token += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return token;
}

/**
 * Get API configuration based on API_ENV environment variable
 * During development, non-mock environments use Vite's proxy at /api-proxy
 * which handles CORS and forwards requests to the actual API server.
 * The proxy also injects the Authorization header, so authToken is not needed client-side.
 * @returns {{ apiBaseUrl: string, authToken: string, projectId: string }}
 */
function getApiConfig() {
	const apiEnv = import.meta.env.VITE_API_ENV || "mock";
	const apiKey = import.meta.env.VITE_API_KEY || "";
	const projectId = import.meta.env.VITE_API_PROJECT_ID || "";
	const useHttps = import.meta.env.VITE_USE_HTTPS !== "false";
	const nodePort = import.meta.env.VITE_NODE_PORT || "3060";

	// Check if we're in development mode (Vite dev server)
	const isDev = import.meta.env.DEV;

	if (apiEnv === "mock") {
		// Mock API: use local dev server with random token
		const protocol = useHttps ? "https" : "http";
		return {
			apiBaseUrl: `${protocol}://localhost:${nodePort}/mock-api`,
			authToken: generateMockToken(),
			projectId: "team/project",
		};
	}

	// For non-mock environments in development, use the local Vite proxy
	// The proxy handles CORS and injects the Authorization header
	if (isDev) {
		const protocol = useHttps ? "https" : "http";
		return {
			apiBaseUrl: `${protocol}://localhost:${nodePort}/api-proxy`,
			authToken: "", // Proxy injects the token server-side
			projectId: projectId,
		};
	}

	// Production build: use the actual API URL directly
	const envConfig = ENVIRONMENT_URLS[apiEnv];
	if (!envConfig) {
		console.warn(
			`[GxP Store] Unknown API_ENV "${apiEnv}", falling back to production`
		);
		return {
			apiBaseUrl: ENVIRONMENT_URLS.production.apiBaseUrl,
			authToken: apiKey,
			projectId: projectId,
		};
	}

	return {
		apiBaseUrl: envConfig.apiBaseUrl,
		authToken: apiKey,
		projectId: projectId,
	};
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
	dependencyList: {},
	permissionFlags: [],
	triggerState: {},
	auth: null,
	userSession: null,
	pluginData: {},
	portalAssets: {},
	portal: null,
};

export const useGxpStore = defineStore("gxp-portal-app", () => {
	// Core configuration - these will be injected by the platform in production
	const pluginVars = ref({ ...defaultData.pluginVars });
	const stringsList = ref({ ...defaultData.stringsList });
	const assetList = ref({ ...defaultData.assetList });
	const dependencyList = ref({ ...defaultData.dependencyList });
	const dependencies = ref([]); // Store full dependency objects for socket initialization
	const permissionFlags = ref([...defaultData.permissionFlags]);
	const triggerState = ref({ ...defaultData.triggerState });

	// User session data (injected by platform in production)
	const auth = ref(defaultData.auth);
	const userSession = ref(defaultData.userSession);
	const pluginData = ref({ ...defaultData.pluginData });
	const portalAssets = ref({ ...defaultData.portalAssets });
	const portal = ref(defaultData.portal);

	const apiOperations = ref({});

	// Loading state for manifest
	const manifestLoaded = ref(false);
	const manifestError = ref(null);

	// API configuration - initialized from environment
	const apiConfig = getApiConfig();
	const apiBaseUrl = ref(apiConfig.apiBaseUrl);
	const authToken = ref(apiConfig.authToken);
	pluginVars.value.projectId = apiConfig.projectId;
	pluginVars.value.apiPageAuthId = apiConfig.authToken;
	pluginVars.value.apiBaseUrl = apiConfig.apiBaseUrl;

	// Log API configuration for debugging
	console.log(
		`[GxP Store] API Environment: ${import.meta.env.VITE_API_ENV || "mock"}`
	);
	console.log(`[GxP Store] API Base URL: ${apiConfig.apiBaseUrl}`);

	// WebSocket configuration - initialized as reactive objects immediately
	const sockets = reactive({});
	const socketConnections = reactive({});

	// API client setup
	const apiClient = axios.create({
		timeout: 30000,
		headers: {
			"Content-Type": "application/json",
		},
	});

	// Add auth token to requests
	apiClient.interceptors.request.use((config) => {
		if (authToken.value) {
			config.headers.Authorization = `Bearer ${authToken.value}`;
		}
		config.baseURL = apiBaseUrl.value;
		return config;
	});

	// Response interceptor for error handling
	apiClient.interceptors.response.use(
		(response) => response,
		(error) => {
			console.error("API Error:", error.response?.data || error.message);
			throw error;
		}
	);

	/**
	 * Load configuration from app-manifest.json
	 * Maps manifest keys to store properties:
	 * - settings -> pluginVars
	 * - strings.default -> stringsList
	 * - assets -> assetList
	 */
	async function loadManifest() {
		try {
			const response = await fetch("/app-manifest.json");
			if (!response.ok) {
				if (response.status === 404) {
					console.log("[GxP Store] No app-manifest.json found, using defaults");
					manifestLoaded.value = true;
					return;
				}
				throw new Error(`HTTP ${response.status}`);
			}

			const manifest = await response.json();
			applyManifest(manifest);
			manifestLoaded.value = true;
			manifestError.value = null;
			console.log("[GxP Store] Loaded configuration from app-manifest.json");

			// Re-initialize dependency sockets after manifest loads
			initializeDependencySockets();
		} catch (error) {
			console.warn(
				"[GxP Store] Could not load app-manifest.json:",
				error.message
			);
			manifestError.value = error.message;
			manifestLoaded.value = true;
		}
	}

	/**
	 * Apply manifest data to store
	 */
	function applyManifest(manifest) {
		if (manifest.settings && typeof manifest.settings === "object") {
			pluginVars.value = { ...defaultData.pluginVars, ...manifest.settings };
		}

		// Handle strings - can be { default: {...} } or flat object
		if (manifest.strings) {
			if (
				manifest.strings.default &&
				typeof manifest.strings.default === "object"
			) {
				stringsList.value = { ...manifest.strings.default };
			} else if (typeof manifest.strings === "object") {
				stringsList.value = { ...manifest.strings };
			}
		}

		if (manifest.assets && typeof manifest.assets === "object") {
			assetList.value = { ...manifest.assets };
		}

		if (manifest.dependencies && Array.isArray(manifest.dependencies)) {
			dependencies.value = manifest.dependencies; // Store full dependency objects
			dependencyList.value = manifest.dependencies.reduce((acc, dependency) => {
				acc[dependency.identifier] = "1";
				return acc;
			}, {});
			console.log("[GxP Store] Dependency List:", dependencyList.value);
		}

		if (manifest.permissions && Array.isArray(manifest.permissions)) {
			permissionFlags.value = [...manifest.permissions];
		}

		if (manifest.triggerState && typeof manifest.triggerState === "object") {
			triggerState.value = { ...manifest.triggerState };
		}
	}

	/**
	 * Initialize primary WebSocket connection
	 * Called synchronously when store is created
	 */
	function initializeSockets() {
		// Primary socket connection
		// Use the same protocol as the current page for Socket.IO connection
		const socketProtocol =
			typeof window !== "undefined" && window.location.protocol === "https:"
				? "https"
				: "http";
		const socketPort = import.meta.env.VITE_SOCKET_IO_PORT || 3069;
		console.log(`[GxP Store] Connecting to Socket.IO on port ${socketPort}`);
		const primarySocket = io(`${socketProtocol}://localhost:${socketPort}`);

		sockets.primary = {
			broadcast: function (event, data) {
				primarySocket.emit(event, data);
			},
			listen: function (event, callback) {
				return primarySocket.on(event, callback);
			},
			listenForStateChange: function (callback) {
				return primarySocket.on("state-change", callback);
			},
		};

		socketConnections.primary = primarySocket;
	}

	/**
	 * Initialize dependency-based sockets
	 * Called after manifest loads to set up dependency-specific listeners
	 */
	function initializeDependencySockets() {
		const primarySocket = socketConnections.primary;
		if (!primarySocket) return;

		// Initialize dependency-based sockets based on the new structure
		if (Array.isArray(dependencies.value)) {
			dependencies.value.forEach((dependency) => {
				if (
					dependency.operations &&
					Object.keys(dependency.operations).length > 0
				) {
					Object.keys(dependency.operations).forEach((operation) => {
						let method = "get";
						let path = dependency.operations[operation];
						if (path.includes(":")) {
							let pathSplit = path.split(":");
							method = pathSplit[0];
							path = pathSplit[1];
						}
						apiOperations.value[operation] = {
							method: method,
							path: path,
						};
					});
				}
				if (dependency.events && Object.keys(dependency.events).length > 0) {
					// Create socket listeners for each event type
					sockets[dependency.identifier] = {};

					Object.keys(dependency.events).forEach((eventType) => {
						const eventName = dependency.events[eventType];
						const channel = `private.${dependency.model}.${dependency.identifier}`;

						sockets[dependency.identifier][eventType] = {
							listen: function (callback) {
								// Listen for the specific event on the primary socket
								return primarySocket.on(eventName, (data) => {
									console.log(
										`Socket event received: ${eventName} on ${channel}`,
										data
									);
									callback(data);
								});
							},
						};
					});
				} else {
					// For dependencies without events, create empty listeners
					sockets[dependency.identifier] = {
						created: { listen: () => () => {} },
						updated: { listen: () => () => {} },
						deleted: { listen: () => () => {} },
					};
				}
			});
		}
	}

	// API methods for common operations
	async function apiGet(endpoint, params = {}) {
		try {
			const response = await apiClient.get(endpoint, { params });
			return response.data;
		} catch (error) {
			throw new Error(`GET ${endpoint}: ${error.message}`);
		}
	}

	async function apiPost(endpoint, data = {}) {
		try {
			const response = await apiClient.post(endpoint, data);
			return response.data;
		} catch (error) {
			throw new Error(`POST ${endpoint}: ${error.message}`);
		}
	}

	async function apiPut(endpoint, data = {}) {
		try {
			const response = await apiClient.put(endpoint, data);
			return response.data;
		} catch (error) {
			throw new Error(`PUT ${endpoint}: ${error.message}`);
		}
	}

	async function apiPatch(endpoint, data = {}) {
		try {
			const response = await apiClient.patch(endpoint, data);
			return response.data;
		} catch (error) {
			throw new Error(`PATCH ${endpoint}: ${error.message}`);
		}
	}

	async function apiDelete(endpoint) {
		try {
			const response = await apiClient.delete(endpoint);
			return response.data;
		} catch (error) {
			throw new Error(`DELETE ${endpoint}: ${error.message}`);
		}
	}
	async function callApi(operation, identifier, data = {}) {
		try {
			const operation = apiOperations.value[operation];
			const response = await apiClient[operation.method](operation.path, data);
			return response.data;
		} catch (error) {
			throw new Error(`${method} ${endpoint}: ${error.message}`);
		}
	}

	// Utility methods
	function getString(key, fallback = "") {
		return stringsList.value[key] || fallback;
	}

	function getSetting(key, fallback = null) {
		return pluginVars.value[key] || fallback;
	}

	function getAsset(key, fallback = "") {
		return assetList.value[key] || fallback;
	}

	function getState(key, fallback = null) {
		return triggerState.value[key] || fallback;
	}
	function findDependency(identifier) {
		if (Array.isArray(dependencyList.value)) {
			return dependencyList.value.find((dep) => dep.identifier === identifier);
		}
		return null;
	}
	function hasPermission(flag) {
		return permissionFlags.value.includes(flag);
	}

	// Update methods - these replace the entire object to ensure Vue reactivity triggers
	// Used by DevTools and for programmatic updates
	function updateString(key, value) {
		stringsList.value = { ...stringsList.value, [key]: value };
	}

	function updateSetting(key, value) {
		pluginVars.value = { ...pluginVars.value, [key]: value };
	}

	function updateAsset(key, value) {
		assetList.value = { ...assetList.value, [key]: value };
	}

	function updateState(key, value) {
		triggerState.value = { ...triggerState.value, [key]: value };
	}

	// Convenience method to add dev assets with proper URL
	function addDevAsset(key, filename) {
		const appPort =
			typeof window !== "undefined" ? window.location.port || 3000 : 3000;
		const appProtocol =
			typeof window !== "undefined" ? window.location.protocol : "http:";
		const assetUrl = `${appProtocol}//localhost:${appPort}/dev-assets/images/${filename}`;
		updateAsset(key, assetUrl);
	}

	// Socket helper methods
	function emitSocket(socketName, event, data) {
		if (sockets[socketName] && sockets[socketName].broadcast) {
			sockets[socketName].broadcast(event, data);
		} else {
			console.warn(`Socket not found: ${socketName}`);
		}
	}

	function listenSocket(socketName, event, callback) {
		if (sockets[socketName] && sockets[socketName].listen) {
			return sockets[socketName].listen(event, callback);
		} else {
			console.warn(`Socket not found: ${socketName}`);
			return () => {};
		}
	}

	// Component helper - allows components to register socket listeners easily
	function useSocketListener(socketName, event, callback) {
		return listenSocket(socketName, event, callback);
	}

	// Theme configuration
	const theme = computed(() => ({
		background_color: getSetting("background_color", "#ffffff"),
		text_color: getSetting("text_color", "#333333"),
		primary_color: getSetting("primary_color", "#FFD600"),
		start_background_color: getSetting(
			"start_background_color",
			"linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
		),
		start_text_color: getSetting("start_text_color", "#ffffff"),
		final_background_color: getSetting("final_background_color", "#4CAF50"),
		final_text_color: getSetting("final_text_color", "#ffffff"),
	}));

	function listAssets() {
		console.log("📁 Current Assets:");
		Object.entries(assetList.value).forEach(([key, url]) => {
			console.log(`   ${key}: ${url}`);
		});
		return assetList.value;
	}

	// Initialize sockets SYNCHRONOUSLY when store is created
	// This ensures sockets is available immediately
	initializeSockets();

	// Load manifest ASYNCHRONOUSLY in the background
	// This allows the store to be used immediately while manifest loads
	loadManifest();

	// Setup Vite HMR for app-manifest.json hot-reload
	if (import.meta.hot) {
		// Listen for custom HMR event from Vite plugin
		import.meta.hot.on("gxp:manifest-update", (data) => {
			console.log("[GxP Store] Hot-reloading app-manifest.json");
			applyManifest(data);
			initializeDependencySockets();
		});

		// Also support full-reload trigger if needed
		import.meta.hot.on("gxp:manifest-reload", () => {
			console.log("[GxP Store] Reloading app-manifest.json");
			loadManifest();
		});
	}

	return {
		// State
		pluginVars,
		stringsList,
		assetList,
		dependencyList,
		permissionFlags,
		auth,
		userSession,
		pluginData,
		portalAssets,
		portal,
		sockets,
		theme,
		triggerState,
		manifestLoaded,
		manifestError,

		// API methods
		apiGet,
		apiPost,
		apiPatch,
		apiPut,
		apiDelete,
		callApi,

		// Utility methods
		getString,
		getSetting,
		getAsset,
		getState,
		hasPermission,
		findDependency,

		// Update methods (for DevTools and programmatic updates)
		updateString,
		updateSetting,
		updateAsset,
		updateState,
		addDevAsset,

		// Socket methods
		emitSocket,
		listenSocket,
		useSocketListener,

		// Manifest methods
		loadManifest,
		applyManifest,

		// Development methods
		listAssets,
	};
});
