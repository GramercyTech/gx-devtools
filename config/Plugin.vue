<template>
    <div id="app">
        <component 
            :is="currentLayout"
            :usr-lang="userLanguage"
            :portal-settings="themeSettings"
            :portal-language="portalStringsList"
            :portal-navigation="portalNavigationList"
            :portal-assets="portalAssetList"
        >
            <!-- Start Page -->
            <GxPageStart
                v-if="currentPage === 'start'"
                :plugin-vars="pluginVars"
                :asset-urls="appAssetList"
                :strings-list="appStringsList"
                :theme="themeSettings"
                @stage-change="goToPage('plugin')"
                @idle-timeout="resetToStart"
            />
            
            <!-- Your Custom Plugin Content -->
            <DemoPage
                v-else-if="currentPage === 'plugin'"
                :plugin-vars="pluginVars"
                :dependency-list="dependencyList"
                :asset-urls="appAssetList"
                :strings-list="appStringsList"
                :permission-flags="permissionFlags"
                :theme="themeSettings"
                :router="mockRouter"
                :sockets="sockets"
                :trigger-state="triggerState"
            />
            
            <!-- Final Page -->
            <GxPageFinal
                v-else-if="currentPage === 'final'"
                :plugin-vars="pluginVars"
                :strings-list="appStringsList"
                :theme="themeSettings"
                @restart="resetToStart"
            />
            
            <!-- Loading overlay -->
            <GxPageLoading
                v-if="isLoading"
                :theme="themeSettings"
                :message="loadingMessage"
            />
        </component>
    </div>
</template>

<style scoped>
#app {
    font-family: Avenir, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}
</style>

<script setup>
import { ref, shallowRef } from "vue";

import "@/theme-layouts/AdditionalStyling.css"
import SystemLayout from "@/theme-layouts/SystemLayout.vue";
import PrivateLayout from "@/theme-layouts/PrivateLayout.vue";
import PublicLayout from "@/theme-layouts/PublicLayout.vue";

import DemoPage from "@/DemoPage.vue";
import {
    GxPageStart,
    GxPageFinal,
    GxPageLoading
} from "@gramercytech/gx-componentkit";

// App state management
const currentLayout = shallowRef(PublicLayout);
const currentPage = ref('start');
const isLoading = ref(false);
const loadingMessage = ref('Loading...');

const changeLayout = (layout) => {
    switch (layout) {
        case 'system':
            currentLayout.value = SystemLayout;
            break;
        case 'private':
            currentLayout.value = PrivateLayout;
            break;
        default:
            currentLayout.value = PublicLayout;
            break;
    }
};

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

const sockets = {};
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

const portalNavigationList = [
    {title: "Start", route: "/start"},
    {title: "Plugin", route: "/plugin"},
    {title: "Final", route: "/final"},
    // {title: "Login", route: "/login", system_type: "login"},
    {title: "Logout", route: "/logout", system_type: "logout"},
]

//Update pluginVars with all the variables that will be set through the custom admin panel in dashboard
const pluginVars = {
    "primary_color": "#FFD600", //This key automatically provided by GxP
    "projectId": 39, //This key automatically provided by GxP
    "apiPageAuthId": "46|j7vCLmx2KG70Ig8R5mtUcNMFcHExvFPZEOv31kKGe1033f2b", //This key automatically provided by GxP
    "apiBaseUrl": "https://api.efcloud.app", //This key automatically provided by GxP
    "idle_timeout": "30", // Idle timeout in seconds
};

//Update assetList with all the assets that will be selected through the custom admin panel in dashboard, GxP will return signed urls for each key
const appAssetList = {
    "main_logo": "https://dashboard.eventfinity.test/storage/assets/69/2HyPwh1692319982.png",
    "background_image": "https://dashboard.eventfinity.test/storage/assets/69/2HyPwh1692319982.png",
};
const portalAssetList = {
    "main_logo": "https://dashboard.eventfinity.test/storage/assets/69/2HyPwh1692319982.png",
    "background_image": "https://dashboard.eventfinity.test/storage/assets/69/2HyPwh1692319982.png",
};

//Update stringsList with all the strings that will be set through the custom admin panel in dashboard, language selection will be handled by GxP
const appStringsList = {
    "line_1": "Welcome to Your App!",
    "line_2": "Touch to begin your experience",
    "line_3": "Get started by touching the button below",
    "start_line_one": "Welcome to Your App!",
    "start_line_two": "Touch to begin your experience",
    "start_touch_start": "Get started by touching the button below",
    "final_line_one": "Thank You!",
    "final_line_two": "Your experience has been completed successfully",
    "final_line_three": "Touch anywhere to start over",
    "welcome_text": "Hello World",
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
//Update dependencyList with all the dependencies that will be set through the custom admin panel in dashboard, GxP will return the id of the selected dependency
const dependencyList = {
    "project_location": 4
};
const triggerState = {
};
//Update permissionFlags with all the permissions that will be set through the custom admin panel in dashboard, GxP will generate this array of flags based on settings set in the dashboard
const permissionFlags = [];

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
            '/camera': 'plugin', // For development, camera stays in plugin
            '/results': 'plugin', // For development, results stays in plugin
            '/share': 'plugin',   // For development, share stays in plugin
            '/instructions': 'plugin' // For development, instructions stays in plugin
        };
        
        const targetPage = routeMap[url] || 'plugin';
        
        // Simulate async navigation
        setTimeout(() => {
            goToPage(targetPage);
            if (options.onFinish) options.onFinish();
        }, 100);
    }
};

// Socket handling is now managed by the GxP datastore
// Access sockets via: const gxpStore = useGxpStore(); gxpStore.sockets

// Expose functions for use in Plugin component
defineExpose({
    goToPage,
    resetToStart,
    showLoading,
    hideLoading
});
</script>

