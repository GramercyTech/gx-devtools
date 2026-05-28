<template>
	<div id="app">
		<!-- Dev Tools Modal -->
		<DevToolsModal
			v-if="showDevTools"
			:store="gxpStore"
			:current-layout="currentLayoutName"
			@close="showDevTools = false"
			@change-layout="changeLayout"
		/>

		<!-- Main Application -->
		<component
			:is="currentLayout"
			:usr-lang="userLanguage"
			:portal-settings="themeSettings"
			:portal-language="portalStringsList"
			:portal-navigation="portalNavigationList"
			:portal-assets="portalAssetList"
		>
			<!-- Your Custom Plugin Content -->
			<Plugin :router="mockRouter" />
		</component>

		<!-- In-page element inspector (Select / Locate modes + editor) -->
		<ElementInspector
			ref="inspectorRef"
			:embedded="embedded"
			@select="onInspectorSelect"
			@locate="onInspectorLocate"
		/>

		<!-- Dev Tools Toggle Button + hover ribbon (bottom-right corner).
		     Hidden when embedded — the host page renders its own menu. -->
		<div v-if="!embedded" class="gx-inspector-ribbon gx-devtools-fab">
			<div class="gx-ribbon-menu">
				<button
					class="gx-ribbon-item"
					title="Open configuration dev tools"
					@click="showDevTools = true"
				>
					<svg
						viewBox="0 0 24 24"
						width="16"
						height="16"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M3 6h18M3 12h18M3 18h18" />
					</svg>
					<span>Config Editor</span>
				</button>
				<button
					class="gx-ribbon-item"
					:class="{ active: inspectorMode === 'select' }"
					title="Select an element to edit (Ctrl+Shift+I)"
					@click="inspectorRef?.toggleSelect()"
				>
					<svg
						viewBox="0 0 24 24"
						width="16"
						height="16"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M3 3l7.5 18 2.5-7 7-2.5L3 3z" />
					</svg>
					<span>Select</span>
				</button>
				<button
					class="gx-ribbon-item"
					:class="{ active: inspectorMode === 'locate' }"
					title="Locate an element's source (broadcasts gxp:open-in-source)"
					@click="inspectorRef?.toggleLocate()"
				>
					<svg
						viewBox="0 0 24 24"
						width="16"
						height="16"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="11" cy="11" r="7" />
						<path d="M21 21l-4.3-4.3" />
					</svg>
					<span>Locate</span>
				</button>
			</div>

			<button
				class="gx-devtools-trigger"
				@click="showDevTools = true"
				title="GxP Dev Tools (hover for options · Ctrl+Shift+D)"
			>
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<circle cx="12" cy="12" r="3" />
					<path
						d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
					/>
				</svg>
			</button>
		</div>
	</div>
</template>

<style scoped>
#app {
	font-family: Avenir, Helvetica, Arial, sans-serif;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}

.gx-devtools-fab {
	position: fixed;
	bottom: 20px;
	right: 20px;
	z-index: 99998;
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 8px;
}

/* Ribbon opens upward; hidden until the FAB is hovered */
.gx-ribbon-menu {
	display: flex;
	flex-direction: column;
	gap: 6px;
	opacity: 0;
	transform: translateY(8px);
	pointer-events: none;
	transition:
		opacity 0.15s ease,
		transform 0.15s ease;
}

.gx-devtools-fab:hover .gx-ribbon-menu {
	opacity: 1;
	transform: translateY(0);
	pointer-events: auto;
}

.gx-ribbon-item {
	display: flex;
	align-items: center;
	gap: 8px;
	background: #1e1e1e;
	border: 1px solid #3d3d3d;
	color: #e0e0e0;
	border-radius: 8px;
	padding: 8px 12px;
	cursor: pointer;
	font-size: 12px;
	font-weight: 600;
	font-family:
		-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
	white-space: nowrap;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	transition: all 0.15s;
}

.gx-ribbon-item:hover {
	border-color: #61dafb;
	color: #61dafb;
}

.gx-ribbon-item.active {
	border-color: #61dafb;
	color: #1e1e1e;
	background: #61dafb;
}

.gx-devtools-trigger {
	width: 44px;
	height: 44px;
	border-radius: 50%;
	background: #1e1e1e;
	border: 2px solid #3d3d3d;
	color: #61dafb;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.2s;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.gx-devtools-trigger:hover {
	background: #2d2d2d;
	border-color: #61dafb;
	transform: scale(1.1);
}

.gx-devtools-trigger svg {
	animation: spin 10s linear infinite;
}

@keyframes spin {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}
</style>

<script setup>
import { ref, shallowRef, computed, watch, onMounted, onUnmounted } from "vue"

// These imports use aliases configured in vite.config.js
// @/ points to the client project's src/ directory
// @layouts/ points to the client project's theme-layouts/ directory
import Plugin from "@/Plugin.vue"
import "@layouts/AdditionalStyling.css"
import SystemLayout from "@layouts/SystemLayout.vue"
import PrivateLayout from "@layouts/PrivateLayout.vue"
import PublicLayout from "@layouts/PublicLayout.vue"
import { storeToRefs } from "pinia"

// Dev Tools
import DevToolsModal from "./dev-tools/DevToolsModal.vue"
import ElementInspector from "./dev-tools/ElementInspector.vue"
import {
	isEmbedded,
	createDevtoolsBridge,
} from "./dev-tools/devtools-bridge.js"

// Initialize the GxP store from client project's stores/index.js
// which re-exports useGxpStore from either the toolkit or a local copy
import { useGxpStore } from "@/stores/index.js"
window.useGxpStore = { useGxpStore }
// App state management
const showDevTools = ref(false)
const inspectorRef = ref(null)
const inspectorMode = computed(() => inspectorRef.value?.mode ?? "off")

// When running inside a host page (iframe), hide the injected menu and let the
// host drive the dev tools over postMessage via the bridge below.
const embedded = isEmbedded()
let devtoolsBridge = null
const currentLayout = shallowRef(PublicLayout)
const currentLayoutName = ref("public")
const currentPage = ref("start")
const isLoading = ref(false)
const loadingMessage = ref("Loading...")

// Layout management
const changeLayout = (layout) => {
	currentLayoutName.value = layout
	switch (layout) {
		case "system":
			currentLayout.value = SystemLayout
			break
		case "private":
			currentLayout.value = PrivateLayout
			break
		default:
			currentLayout.value = PublicLayout
			currentLayoutName.value = "public"
			break
	}
	console.log(`[GxP] Layout changed to: ${currentLayoutName.value}`)
}

// Expose layout control to window
window.changeLayout = changeLayout

// Initialize the GxP store
const gxpStore = useGxpStore()
gxpStore.sockets?.primary?.listenForStateChange?.((event) => {
	console.log("🔗 GXP Store: State change event received", event)
})

const { theme } = storeToRefs(gxpStore)
// Navigation functions
const goToPage = (page) => {
	currentPage.value = page
}

const resetToStart = () => {
	currentPage.value = "start"
}

const showLoading = (message = "Loading...") => {
	loadingMessage.value = message
	isLoading.value = true
}

const hideLoading = () => {
	isLoading.value = false
}

const logout = () => {
	alert("Logging Out")
}

// Mock router to simulate platform navigation during development
const mockRouter = {
	visit: (url, options = {}) => {
		console.log(`🔗 Mock Router: Navigating to ${url}`, options)

		// Simulate platform navigation behavior
		if (options.onStart) options.onStart()

		// Map platform routes to local pages
		const routeMap = {
			"/start": "start",
			"/plugin": "plugin",
			"/final": "final",
			"/camera": "plugin",
			"/results": "plugin",
			"/share": "plugin",
			"/instructions": "plugin",
		}

		const targetPage = routeMap[url] || "plugin"

		// Simulate async navigation
		setTimeout(() => {
			goToPage(targetPage)
			if (options.onFinish) options.onFinish()
		}, 100)
	},
}

const userLanguage = ""

// Theme configuration
const themeSettings = {
	primary: "#FFD600",
	page_background_color: "#000466",
	page_text_color: "#ffffff",
	input_field_background_color: "#03054a",
	input_field_text_color: "#ffffff",
	input_field_border_color: "#888c92",
	primary_button_background_color: "#ffffff",
	primary_button_text_color: "#000596",
	primary_button_border_color: "#ffffff",
	secondary_button_background_color: "#000466",
	secondary_button_text_color: "#ffffff",
	secondary_button_border_color: "#ffffff",
	tertiary_button_background_color: "#ffffff00",
	tertiary_button_text_color: "#ffffff",
	tertiary_button_border_color: "#ffffff00",
	spinner_background_color: "#03054a",
	spinner_color: "#ffffff",
	modal_background_color: "#ffffff",
	modal_text_color: "#222222",
	modal_primary_button_background_color: "#000596",
	modal_primary_button_text_color: "#ffffff",
	modal_primary_button_border_color: "#000596",
	modal_secondary_button_background_color: "#ffffff",
	modal_secondary_button_text_color: "#000596",
	modal_secondary_button_border_color: "#000596",
}

const themeColors = {
	background_color: "#ffffff",
}

const permissionFlags = []
const sockets = {}
const userAuth = {}

// Update dependencyList with all the dependencies that will be set through the custom admin panel
const dependencyList = {
	project_location: 4,
}

// Update pluginVars with all the variables that will be set through the custom admin panel
const pluginVars = {
	primary_color: "#FFD600",
	projectId: 39,
	apiPageAuthId: "46|j7vCLmx2KG70Ig8R5mtUcNMFcHExvFPZEOv31kKGe1033f2b",
	apiBaseUrl: "https://api.efcloud.app",
	idle_timeout: "30",
}

const userSession = ""

const portalNavigationList = [
	{ title: "Start", route: "/start" },
	{ title: "Plugin", route: "/plugin" },
	{ title: "Final", route: "/final" },
	{ title: "Logout", route: "/logout", system_type: "logout" },
]

// Update assetList with all the assets that will be selected through the custom admin panel
const appAssetList = {
	main_logo:
		"https://dashboard.eventfinity.test/storage/assets/69/2HyPwh1692319982.png",
	background_image:
		"https://dashboard.eventfinity.test/storage/assets/69/2HyPwh1692319982.png",
}

const portalAssetList = {
	main_logo:
		"https://dashboard.eventfinity.test/storage/assets/69/2HyPwh1692319982.png",
	background_image:
		"https://dashboard.eventfinity.test/storage/assets/69/2HyPwh1692319982.png",
}

const portalStringsList = {
	start_line_one: "Welcome to Your App!",
	start_line_two: "Touch to begin your experience",
	start_touch_start: "Get started by touching the button below",
	final_line_one: "Thank You!",
	final_line_two: "Your experience has been completed successfully",
	final_line_three: "Touch anywhere to start over",
	welcome_text: "Hello World",
}

const appStringsList = {
	start_line_one: "Welcome to Your App!",
	start_line_two: "Touch to begin your experience",
	start_touch_start: "Get started by touching the button below",
	final_line_one: "Thank You!",
	final_line_two: "Your experience has been completed successfully",
	final_line_three: "Touch anywhere to start over",
	welcome_text: "Hello World",
}

// Keyboard shortcut handler
function handleKeydown(e) {
	// Ctrl+Shift+D (or Cmd+Shift+D on Mac) to toggle dev tools
	if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "D") {
		e.preventDefault()
		showDevTools.value = !showDevTools.value
	}
}

// Setup window.gxDevTools API
function setupDevToolsAPI() {
	window.gxDevTools = {
		open: () => {
			showDevTools.value = true
			console.log("[GxP] Dev Tools opened")
		},
		close: () => {
			showDevTools.value = false
			console.log("[GxP] Dev Tools closed")
		},
		toggle: () => {
			showDevTools.value = !showDevTools.value
			console.log(`[GxP] Dev Tools ${showDevTools.value ? "opened" : "closed"}`)
		},
		isOpen: () => showDevTools.value,
		// Convenience methods
		store: () => gxpStore,
		setLayout: (layout) => changeLayout(layout),
		getLayout: () => currentLayoutName.value,
		// Element inspector (in-page, no browser extension required)
		toggleSelect: () => inspectorRef.value?.toggleSelect(),
		toggleLocate: () => inspectorRef.value?.toggleLocate(),
		inspectorMode: () => inspectorMode.value,
	}

	// Legacy support
	window.toggleConfigPanel = () => window.gxDevTools.toggle()
}

// ── Embedded mode: host-driven dev tools bridge ────────────────────────
function safeClone(value) {
	try {
		return JSON.parse(JSON.stringify(value))
	} catch {
		return null
	}
}

function snapshotStore() {
	return {
		pluginVars: safeClone(gxpStore.pluginVars),
		stringsList: safeClone(gxpStore.stringsList),
		assetList: safeClone(gxpStore.assetList),
		triggerState: safeClone(gxpStore.triggerState),
		permissionFlags: safeClone(gxpStore.permissionFlags),
		dependencyList: safeClone(gxpStore.dependencyList),
	}
}

// Handlers the host can invoke over postMessage. These run the exact same
// in-page operations the local menu would.
const bridgeHandlers = {
	ping: () => ({ embedded, mode: inspectorMode.value }),
	setMode: (p) => {
		inspectorRef.value?.setMode(p?.mode || "off")
		return { mode: inspectorMode.value }
	},
	select: () => {
		inspectorRef.value?.setMode("select")
		return { mode: inspectorMode.value }
	},
	locate: () => {
		inspectorRef.value?.setMode("locate")
		return { mode: inspectorMode.value }
	},
	exit: () => {
		inspectorRef.value?.setMode("off")
		return { mode: "off" }
	},
	describeSelection: () => inspectorRef.value?.describeSelection() ?? null,
	highlight: (p) => inspectorRef.value?.highlightLoc(p?.loc) ?? null,
	clearHighlight: () => {
		inspectorRef.value?.clearSelection()
		return { ok: true }
	},
	getComponentTree: () => inspectorRef.value?.getComponentTree() ?? [],
	getLayouts: () => ["public", "private", "system"],
	getLayout: () => currentLayoutName.value,
	setLayout: (p) => {
		changeLayout(p?.layout)
		return { layout: currentLayoutName.value }
	},
	openConfig: () => {
		showDevTools.value = true
		return { open: true }
	},
	closeConfig: () => {
		showDevTools.value = false
		return { open: false }
	},
	getStore: () => snapshotStore(),
	getState: (p) => gxpStore.getState?.(p?.key, p?.fallback),
	setState: (p) => {
		if (p?.key != null) {
			gxpStore.triggerState[p.key] = p.value
		}
		return { key: p?.key, value: p?.value }
	},
	/**
	 * Runtime mutation of any object-shaped store section
	 * (pluginVars, stringsList, assetList, triggerState, dependencyList).
	 * Used by the host dev-tools modal's editable Store view so a
	 * developer can preview a different value live without redeploying
	 * the plugin. Edits aren't persisted — production values still flow
	 * from the admin panel — but the preview iframe reflects the change
	 * immediately via Pinia reactivity. Returns an `{ ok: false, error }`
	 * shape (instead of throwing) so the host can render a clean inline
	 * error without unwinding the postMessage round-trip as a generic
	 * exception.
	 */
	setStoreValue: (p) => {
		const section = p?.section
		const key = p?.key
		if (!section || key == null) {
			return { ok: false, error: "section and key are required" }
		}
		// Whitelist the sections we expose for editing so a stray
		// `setStoreValue({section:"$state"})` can't corrupt the Pinia
		// internals or sockets/auth refs the agent shouldn't touch.
		const EDITABLE_SECTIONS = new Set([
			"pluginVars",
			"stringsList",
			"assetList",
			"triggerState",
			"dependencyList",
		])
		if (!EDITABLE_SECTIONS.has(section)) {
			return { ok: false, error: `Section "${section}" is not editable` }
		}
		const target = gxpStore[section]
		if (!target || typeof target !== "object") {
			return { ok: false, error: `Section "${section}" is not an object` }
		}
		target[key] = p.value
		return { ok: true, section, key, value: p.value }
	},
	// Convenience proxy so the host can hit the dev-server source-edit API
	// through the same channel (avoids cross-origin fetch juggling host-side).
	api: async (p) => {
		const res = await fetch(`/__gxp-inspector${p.endpoint}`, {
			method: p.method || "POST",
			headers: { "Content-Type": "application/json" },
			body: p.body != null ? JSON.stringify(p.body) : undefined,
		})
		return res.json()
	},
}

function onInspectorSelect(payload) {
	devtoolsBridge?.emit("element-selected", payload)
}

function onInspectorLocate(payload) {
	devtoolsBridge?.emit("open-in-source", payload)
}

// Expose functions for use in Plugin component
defineExpose({
	goToPage,
	resetToStart,
	showLoading,
	hideLoading,
	gxpStore,
})

onMounted(() => {
	// Setup keyboard shortcut
	document.addEventListener("keydown", handleKeydown)

	// Setup dev tools API
	setupDevToolsAPI()

	// Welcome message
	console.log(
		"%c GxP Developer Toolkit ",
		"background: #61dafb; color: #1e1e1e; font-size: 14px; padding: 4px 8px; border-radius: 4px;",
	)
	console.log(
		"%c Dev Tools: Press Ctrl+Shift+D or click the gear icon ",
		"color: #888; font-size: 12px;",
	)
	console.log(
		"%c Console API: window.gxDevTools.open() / .close() / .toggle() ",
		"color: #888; font-size: 12px;",
	)

	// Stand up the host bridge. Always created so a host page (or test harness)
	// can drive the tools; the floating menu is only hidden when `embedded`.
	devtoolsBridge = createDevtoolsBridge({ handlers: bridgeHandlers })
	watch(inspectorMode, (mode) => devtoolsBridge?.emit("mode-changed", { mode }))

	if (embedded) {
		console.log(
			"%c GxP Dev Tools running embedded — controlled by host via postMessage ",
			"color: #61dafb; font-size: 12px;",
		)
	}
})

onUnmounted(() => {
	document.removeEventListener("keydown", handleKeydown)
	devtoolsBridge?.destroy()
	devtoolsBridge = null
	delete window.gxDevTools
	delete window.toggleConfigPanel
	delete window.changeLayout
})
</script>
<style>
/* Theme CSS Variables */
:root {
	--primary: v-bind("theme.primary");
	--page_background_color: v-bind("theme.page_background_color");
	--page_text_color: v-bind("theme.page_text_color");
	--input_field_background_color: v-bind("theme.input_field_background_color");
	--input_field_text_color: v-bind("theme.input_field_text_color");
	--input_field_border_color: v-bind("theme.input_field_border_color");
	--primary_button_background_color: v-bind(
		"theme.primary_button_background_color"
	);
	--primary_button_text_color: v-bind("theme.primary_button_text_color");
	--primary_button_border_color: v-bind("theme.primary_button_border_color");
	--secondary_button_background_color: v-bind(
		"theme.secondary_button_background_color"
	);
	--secondary_button_text_color: v-bind("theme.secondary_button_text_color");
	--secondary_button_border_color: v-bind(
		"theme.secondary_button_border_color"
	);
	--tertiary_button_background_color: v-bind(
		"theme.tertiary_button_background_color"
	);
	--tertiary_button_text_color: v-bind("theme.tertiary_button_text_color");
	--tertiary_button_border_color: v-bind("theme.tertiary_button_border_color");
	--spinner_background_color: v-bind("theme.spinner_background_color");
	--spinner_color: v-bind("theme.spinner_color");
	--modal_background_color: v-bind("theme.modal_background_color");
	--modal_text_color: v-bind("theme.modal_text_color");
	--modal_primary_button_background_color: v-bind(
		"theme.modal_primary_button_background_color"
	);
	--modal_primary_button_text_color: v-bind(
		"theme.modal_primary_button_text_color"
	);
	--modal_primary_button_border_color: v-bind(
		"theme.modal_primary_button_border_color"
	);
	--modal_secondary_button_background_color: v-bind(
		"theme.modal_secondary_button_background_color"
	);
	--modal_secondary_button_text_color: v-bind(
		"theme.modal_secondary_button_text_color"
	);
	--modal_secondary_button_border_color: v-bind(
		"theme.modal_secondary_button_border_color"
	);
}
</style>
