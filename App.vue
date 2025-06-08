<template>
    <div id="app">
        <!-- Start Page -->
        <GxPageStart
            v-if="currentPage === 'start'"
            :plugin-vars="gxpStore.pluginVars"
            :asset-urls="gxpStore.assetList"
            :strings-list="gxpStore.stringsList"
            :theme="gxpStore.theme"
            @stage-change="goToPage('plugin')"
            @idle-timeout="resetToStart"
        />
        
        <!-- Your Custom Plugin Content -->
        <Plugin
            v-else-if="currentPage === 'plugin'"
            :plugin-vars="pluginVars"
            :dependency-list="dependencyList"
            :asset-urls="assetList"

            :strings-list="stringsList"
            :permission-flags="permissionFlags"
            :theme="theme"
            @back="goToPage('start')"
            @complete="goToPage('final')"
        />
        
        <!-- Final Page -->
        <GxPageFinal
            v-else-if="currentPage === 'final'"
            :plugin-vars="pluginVars"
            :strings-list="stringsList"
            :theme="theme"
            @restart="resetToStart"
        />
        
        <!-- Loading overlay -->
        <GxPageLoading
            v-if="isLoading"
            :theme="theme"
            :message="loadingMessage"
        />
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
import { ref } from "vue";
import Plugin from "/src/Plugin.vue";
import {
    GxPageStart,
    GxPageFinal,
    GxPageLoading
} from "@gramercytech/gx-componentkit";

// App state management
const currentPage = ref('start');
const isLoading = ref(false);
const loadingMessage = ref('Loading...');

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

// Theme configuration
const theme = {
    background_color: "#ffffff",
    text_color: "#333333",
    primary_color: "#FFD600",
    start_background_color: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    start_text_color: "#ffffff",
    final_background_color: "#4CAF50",
    final_text_color: "#ffffff",
};

//Update pluginVars with all the variables that will be set through the custom admin panel in dashboard
const pluginVars = {
    "primary_color": "#FFD600", //This key automatically provided by GxP
    "projectId": 39, //This key automatically provided by GxP
    "apiPageAuthId": "46|j7vCLmx2KG70Ig8R5mtUcNMFcHExvFPZEOv31kKGe1033f2b", //This key automatically provided by GxP
    "apiBaseUrl": "https://api.efcloud.app", //This key automatically provided by GxP
    "idle_timeout": "30", // Idle timeout in seconds
};

//Update assetList with all the assets that will be selected through the custom admin panel in dashboard, GxP will return signed urls for each key
const assetList = {
    "main_logo": "https://dashboard.eventfinity.test/storage/assets/69/2HyPwh1692319982.png",
    "background_image": "https://dashboard.eventfinity.test/storage/assets/69/2HyPwh1692319982.png",
};

//Update stringsList with all the strings that will be set through the custom admin panel in dashboard, language selection will be handled by GxP
const stringsList = {
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

//Update permissionFlags with all the permissions that will be set through the custom admin panel in dashboard, GxP will generate this array of flags based on settings set in the dashboard
const permissionFlags = [];

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

