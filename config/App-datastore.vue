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
            <!-- Your Custom Plugin Content -->
            <Plugin
                :router="mockRouter"
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
import Plugin from "@/Plugin.vue";
import {
    GxPageStart,
    GxPageFinal,
    GxPageLoading
} from "@gramercytech/gx-componentkit";

import "@/theme-layouts/AdditionalStyling.css"
import SystemLayout from "@/theme-layouts/SystemLayout.vue";
import PrivateLayout from "@/theme-layouts/PrivateLayout.vue";
import PublicLayout from "@/theme-layouts/PublicLayout.vue";

// Initialize the GxP store
import { useGxpStore } from "@/stores/gxpPortalConfigStore";

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

const gxpStore = useGxpStore();
gxpStore.sockets?.primary.listenForStateChange((event) => {
    console.log('🔗 GXP Store: State change event received', event);
})
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

// Expose functions for use in Plugin component
defineExpose({
    goToPage,
    resetToStart,
    showLoading,
    hideLoading,
    gxpStore
});
</script> 