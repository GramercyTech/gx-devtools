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
            @back="goToPage('start')"
            @complete="goToPage('final')"
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
// import { useGxpStore } from '@/Store/gxpPortalConfigStore';

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

// Expose functions for use in Plugin component
defineExpose({
    goToPage,
    resetToStart,
    showLoading,
    hideLoading,
    gxpStore
});
</script> 