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
            <Plugin
                :router="mockRouter"
            />
        </component>

        <!-- Dev Tools Toggle Button (visible in corner) -->
        <button
            class="gx-devtools-trigger"
            @click="showDevTools = true"
            title="Open Dev Tools (Ctrl+Shift+D)"
        >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
        </button>
    </div>
</template>

<style scoped>
#app {
    font-family: Avenir, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

.gx-devtools-trigger {
    position: fixed;
    bottom: 20px;
    right: 20px;
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
    z-index: 99998;
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
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
</style>

<script setup>
import { ref, shallowRef, onMounted, onUnmounted } from "vue";

// These imports use aliases configured in vite.config.js
// @/ points to the client project's src/ directory
// @layouts/ points to the client project's theme-layouts/ directory
import Plugin from "@/Plugin.vue";
import "@layouts/AdditionalStyling.css";
import SystemLayout from "@layouts/SystemLayout.vue";
import PrivateLayout from "@layouts/PrivateLayout.vue";
import PublicLayout from "@layouts/PublicLayout.vue";

// Dev Tools
import DevToolsModal from "./dev-tools/DevToolsModal.vue";

// Initialize the GxP store from client project's stores/index.js
// which re-exports useGxpStore from either the toolkit or a local copy
import { useGxpStore } from "@/stores/index.js";
window.useGxpStore = { useGxpStore };
// App state management
const showDevTools = ref(false);
const currentLayout = shallowRef(PublicLayout);
const currentLayoutName = ref('public');
const currentPage = ref('start');
const isLoading = ref(false);
const loadingMessage = ref('Loading...');

// Layout management
const changeLayout = (layout) => {
    currentLayoutName.value = layout;
    switch (layout) {
        case 'system':
            currentLayout.value = SystemLayout;
            break;
        case 'private':
            currentLayout.value = PrivateLayout;
            break;
        default:
            currentLayout.value = PublicLayout;
            currentLayoutName.value = 'public';
            break;
    }
    console.log(`[GxP] Layout changed to: ${currentLayoutName.value}`);
};

// Expose layout control to window
window.changeLayout = changeLayout;

// Initialize the GxP store
const gxpStore = useGxpStore();
gxpStore.sockets?.primary?.listenForStateChange?.((event) => {
    console.log('🔗 GXP Store: State change event received', event);
});

// Navigation functions
const goToPage = (page) => {
    currentPage.value = page;
};

const resetToStart = () => {
    currentPage.value = 'start';
};

const showLoading = (message = 'Loading...') => {
    loadingMessage.value = message;
    isLoading.value = true;
};

const hideLoading = () => {
    isLoading.value = false;
};

const logout = () => {
    alert("Logging Out");
};

// Mock router to simulate platform navigation during development
const mockRouter = {
    visit: (url, options = {}) => {
        console.log(`🔗 Mock Router: Navigating to ${url}`, options);

        // Simulate platform navigation behavior
        if (options.onStart) options.onStart();

        // Map platform routes to local pages
        const routeMap = {
            '/start': 'start',
            '/plugin': 'plugin',
            '/final': 'final',
            '/camera': 'plugin',
            '/results': 'plugin',
            '/share': 'plugin',
            '/instructions': 'plugin'
        };

        const targetPage = routeMap[url] || 'plugin';

        // Simulate async navigation
        setTimeout(() => {
            goToPage(targetPage);
            if (options.onFinish) options.onFinish();
        }, 100);
    }
};

const userLanguage = "";

// Theme configuration
const themeSettings = {
    background_color: "#ffffff",
    text_color: "#333333",
    primary_color: "#FFD600",
    start_background_color: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    start_text_color: "#ffffff",
    final_background_color: "#4CAF50",
    final_text_color: "#ffffff",
};

const themeColors = {
    background_color: "#ffffff",
};

const permissionFlags = [];
const sockets = {};
const userAuth = {};

// Update dependencyList with all the dependencies that will be set through the custom admin panel
const dependencyList = {
    "project_location": 4
};

// Update pluginVars with all the variables that will be set through the custom admin panel
const pluginVars = {
    "primary_color": "#FFD600",
    "projectId": 39,
    "apiPageAuthId": "46|j7vCLmx2KG70Ig8R5mtUcNMFcHExvFPZEOv31kKGe1033f2b",
    "apiBaseUrl": "https://api.efcloud.app",
    "idle_timeout": "30",
};

const userSession = "";

const portalNavigationList = [
    {title: "Start", route: "/start"},
    {title: "Plugin", route: "/plugin"},
    {title: "Final", route: "/final"},
    {title: "Logout", route: "/logout", system_type: "logout"},
];

// Update assetList with all the assets that will be selected through the custom admin panel
const appAssetList = {
    "main_logo": "https://dashboard.eventfinity.test/storage/assets/69/2HyPwh1692319982.png",
    "background_image": "https://dashboard.eventfinity.test/storage/assets/69/2HyPwh1692319982.png",
};

const portalAssetList = {
    "main_logo": "https://dashboard.eventfinity.test/storage/assets/69/2HyPwh1692319982.png",
    "background_image": "https://dashboard.eventfinity.test/storage/assets/69/2HyPwh1692319982.png",
};

const portalStringsList = {
    "start_line_one": "Welcome to Your App!",
    "start_line_two": "Touch to begin your experience",
    "start_touch_start": "Get started by touching the button below",
    "final_line_one": "Thank You!",
    "final_line_two": "Your experience has been completed successfully",
    "final_line_three": "Touch anywhere to start over",
    "welcome_text": "Hello World",
};

const appStringsList = {
    "start_line_one": "Welcome to Your App!",
    "start_line_two": "Touch to begin your experience",
    "start_touch_start": "Get started by touching the button below",
    "final_line_one": "Thank You!",
    "final_line_two": "Your experience has been completed successfully",
    "final_line_three": "Touch anywhere to start over",
    "welcome_text": "Hello World",
};

// Keyboard shortcut handler
function handleKeydown(e) {
    // Ctrl+Shift+D (or Cmd+Shift+D on Mac) to toggle dev tools
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        showDevTools.value = !showDevTools.value;
    }
}

// Setup window.gxDevTools API
function setupDevToolsAPI() {
    window.gxDevTools = {
        open: () => {
            showDevTools.value = true;
            console.log('[GxP] Dev Tools opened');
        },
        close: () => {
            showDevTools.value = false;
            console.log('[GxP] Dev Tools closed');
        },
        toggle: () => {
            showDevTools.value = !showDevTools.value;
            console.log(`[GxP] Dev Tools ${showDevTools.value ? 'opened' : 'closed'}`);
        },
        isOpen: () => showDevTools.value,
        // Convenience methods
        store: () => gxpStore,
        setLayout: (layout) => changeLayout(layout),
        getLayout: () => currentLayoutName.value,
    };

    // Legacy support
    window.toggleConfigPanel = () => window.gxDevTools.toggle();
}

// Expose functions for use in Plugin component
defineExpose({
    goToPage,
    resetToStart,
    showLoading,
    hideLoading,
    gxpStore
});

onMounted(() => {
    // Setup keyboard shortcut
    document.addEventListener('keydown', handleKeydown);

    // Setup dev tools API
    setupDevToolsAPI();

    // Welcome message
    console.log('%c GxP Developer Toolkit ', 'background: #61dafb; color: #1e1e1e; font-size: 14px; padding: 4px 8px; border-radius: 4px;');
    console.log('%c Dev Tools: Press Ctrl+Shift+D or click the gear icon ', 'color: #888; font-size: 12px;');
    console.log('%c Console API: window.gxDevTools.open() / .close() / .toggle() ', 'color: #888; font-size: 12px;');
});

onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
    delete window.gxDevTools;
    delete window.toggleConfigPanel;
    delete window.changeLayout;
});
</script>
