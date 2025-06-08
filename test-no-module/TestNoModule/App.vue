<template>
    <div id="app">
        <!-- Start Page -->
        <GxPageStart
            v-if="currentPage === 'start'"
            :plugin-vars="gxpStore.pluginVars"
            :asset-urls="gxpStore.assetList"
            :strings-list="gxpStore.stringsList"
            :theme="gxpStore.theme"
            @start="goToPage('plugin')"
            @idle-timeout="resetToStart"
        />
        
        <!-- Your Custom Plugin Content -->
        <Plugin
            v-else-if="currentPage === 'plugin'"
            :router="mockRouter"
        />
        
        <!-- Final Page -->
        <GxPageFinal
            v-else-if="currentPage === 'final'"
            :plugin-vars="gxpStore.pluginVars"
            :strings-list="gxpStore.stringsList"
            :theme="gxpStore.theme"
            @restart="resetToStart"
        />
        
        <!-- Loading overlay -->
        <GxPageLoading
            v-if="isLoading"
            :theme="gxpStore.theme"
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
// Instead of:
// import { useGxpStore } from '@/stores/gxpPortalConfigStore';

// Use:
import { useStore } from '@/composables/useStore';

// Initialize the GxP store
const gxpStore = useStore(); // This will automatically use global or local store

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

// Expose functions for use in Plugin component
defineExpose({
    goToPage,
    resetToStart,
    showLoading,
    hideLoading,
    gxpStore
});
</script> 