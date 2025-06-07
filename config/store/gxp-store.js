import { defineStore } from "pinia";
import { ref, computed, reactive } from "vue";
import axios from "axios";
import { io } from "socket.io-client";
import testData from "./test-data.json";

export const useGxpStore = defineStore("gxp", () => {
	// Core configuration - these will be injected by the platform in production
	const pluginVars = ref({ ...testData.pluginVars });
	const stringsList = ref({ ...testData.stringsList });
	const assetList = ref({ ...testData.assetList });
	const dependencyList = ref({ ...testData.dependencyList });
	const permissionFlags = ref(testData.permissionFlags || []);

	// User session data (injected by platform in production)
	const auth = ref(testData.auth || null);
	const userSession = ref(testData.userSession || null);
	const pluginData = ref(testData.pluginData || {});
	const portalAssets = ref(testData.portalAssets || {});
	const portal = ref(testData.portal || null);

	// API configuration
	const apiBaseUrl = computed(
		() => pluginVars.value.apiBaseUrl || "https://api.efcloud.app"
	);
	const authToken = computed(() => pluginVars.value.apiPageAuthId || "");

	// WebSocket configuration
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

	// Initialize WebSocket connections
	function initializeSockets() {
		// Primary socket connection
		const primarySocket = io("http://localhost:3069");

		sockets.primary = {
			broadcast: function (event, data) {
				primarySocket.emit(event, data);
			},
			listen: function (event, callback) {
				return primarySocket.on(event, callback);
			},
		};

		socketConnections.primary = primarySocket;

		// Initialize dependency-based sockets
		Object.keys(dependencyList.value).forEach((depKey) => {
			sockets[depKey] = {
				created: {
					listen: function (event, callback) {
						// In development, return empty function
						// In production, this would connect to actual dependency socket
						return () => {};
					},
				},
				updated: {
					listen: function (event, callback) {
						return () => {};
					},
				},
				deleted: {
					listen: function (event, callback) {
						return () => {};
					},
				},
			};
		});
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

	async function apiDelete(endpoint) {
		try {
			const response = await apiClient.delete(endpoint);
			return response.data;
		} catch (error) {
			throw new Error(`DELETE ${endpoint}: ${error.message}`);
		}
	}

	// Dependency API methods
	async function getDependencyData(dependencyKey, endpoint) {
		const dependencyId = dependencyList.value[dependencyKey];
		if (!dependencyId) {
			throw new Error(`Dependency not found: ${dependencyKey}`);
		}

		return await apiGet(`/dependencies/${dependencyId}/${endpoint}`);
	}

	async function updateDependencyData(dependencyKey, endpoint, data) {
		const dependencyId = dependencyList.value[dependencyKey];
		if (!dependencyId) {
			throw new Error(`Dependency not found: ${dependencyKey}`);
		}

		return await apiPost(`/dependencies/${dependencyId}/${endpoint}`, data);
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

	function hasPermission(flag) {
		return permissionFlags.value.includes(flag);
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

	// Configuration update methods (for development)
	function updatePluginVar(key, value) {
		pluginVars.value[key] = value;
	}

	function updateString(key, value) {
		stringsList.value[key] = value;
	}

	function updateAsset(key, value) {
		assetList.value[key] = value;
	}

	// Initialize sockets when store is created
	initializeSockets();

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

		// API methods
		apiGet,
		apiPost,
		apiPut,
		apiDelete,
		getDependencyData,
		updateDependencyData,

		// Utility methods
		getString,
		getSetting,
		getAsset,
		hasPermission,

		// Socket methods
		emitSocket,
		listenSocket,
		useSocketListener,

		// Development methods
		updatePluginVar,
		updateString,
		updateAsset,
	};
});
