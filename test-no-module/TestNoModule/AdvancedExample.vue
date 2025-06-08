<!--
    ADVANCED EXAMPLE - Plugin.vue Reference
    
    This file demonstrates how to build a complex multi-page workflow within your Plugin.vue component.
    It shows a complete kiosk experience with:
    - Instructions → Camera → Results → Share → Final
    - Error handling and state management
    - Usage of all major gx-componentkit components
    
    DO NOT use this as a replacement for App.vue - this is an example of what you can build
    inside your Plugin.vue component when you need advanced workflows.
    
    To implement something similar:
    1. Copy the relevant parts into your Plugin.vue
    2. Remove the app container div and #app styles
    3. Wrap everything in GxThemeWrapper with your theme prop
    4. Use emit('back') and emit('complete') for navigation to platform pages
-->
<template>
    <div id="app">
        <!-- Start Page -->
        <GxPageStart
            v-if="currentPage === 'start'"
            :plugin-vars="pluginVars"
            :asset-urls="assetList"
            :strings-list="stringsList"
            :theme="theme"
            @start="goToPage('instructions')"
            @idle-timeout="resetToStart"
        />
        
        <!-- Instructions Page -->
        <GxPageInstructions
            v-else-if="currentPage === 'instructions'"
            :plugin-vars="pluginVars"
            :strings-list="stringsList"
            :theme="theme"
            @continue="goToPage('camera')"
            @back="goToPage('start')"
        />
        
        <!-- Camera Page -->
        <GxPageCamera
            v-else-if="currentPage === 'camera'"
            :plugin-vars="pluginVars"
            :theme="theme"
            @photo-taken="handlePhotoTaken"
            @back="goToPage('instructions')"
        />
        
        <!-- Results Page -->
        <GxPageResults
            v-else-if="currentPage === 'results'"
            :plugin-vars="pluginVars"
            :strings-list="stringsList"
            :theme="theme"
            :results="results"
            @continue="goToPage('share')"
            @back="goToPage('camera')"
        />
        
        <!-- Share Page -->
        <GxPageShare
            v-else-if="currentPage === 'share'"
            :plugin-vars="pluginVars"
            :strings-list="stringsList"
            :theme="theme"
            :share-data="shareData"
            @shared="goToPage('final')"
            @skip="goToPage('final')"
            @back="goToPage('results')"
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
        
        <!-- Error Modal -->
        <GxModal
            v-if="showErrorModal"
            :plugin-vars="errorModalConfig"
            :theme="theme"
            @close-modal="showErrorModal = false"
        />
    </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { io } from "socket.io-client";
import {
    GxPageStart,
    GxPageInstructions,
    GxPageCamera,
    GxPageResults,
    GxPageShare,
    GxPageFinal,
    GxPageLoading,
    GxModal,
    useMedia,
    useErrors
} from "@gramercytech/gx-componentkit";

// Use the same protocol as the current page for Socket.IO connection
const socketProtocol = window.location.protocol === 'https:' ? 'https' : 'http';
const socket = io(`${socketProtocol}://localhost:${process.env.SOCKET_IO_PORT || 3069}`);

// Composables
const { errorMessages, addError, clearErrors } = useErrors();
const mediaComposable = useMedia();

// App state management
const currentPage = ref('start');
const isLoading = ref(false);
const loadingMessage = ref('Loading...');
const showErrorModal = ref(false);
const results = ref([]);
const shareData = ref(null);

// Navigation functions
const goToPage = (page) => {
    clearErrors();
    currentPage.value = page;
};

const resetToStart = () => {
    // Reset all state
    currentPage.value = 'start';
    results.value = [];
    shareData.value = null;
    clearErrors();
    hideLoading();
};

const showLoading = (message = 'Loading...') => {
    loadingMessage.value = message;
    isLoading.value = true;
};

const hideLoading = () => {
    isLoading.value = false;
};

// Event handlers
const handlePhotoTaken = (photoData) => {
    showLoading('Processing your photo...');
    
    // Simulate processing
    setTimeout(() => {
        results.value = [
            { id: 1, title: 'Original Photo', image: photoData.url },
            { id: 2, title: 'Filtered Version', image: photoData.url },
            { id: 3, title: 'Enhanced Version', image: photoData.url }
        ];
        
        shareData.value = {
            image: photoData.url,
            title: 'Check out my photo!',
            description: 'Created with our awesome kiosk app'
        };
        
        hideLoading();
        goToPage('results');
    }, 2000);
};

// Error handling
const handleError = (error) => {
    addError(error.message || 'An unexpected error occurred');
    showErrorModal.value = true;
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
    modal_background_color: "#ffffff",
    modal_text_color: "#333333",
    primaryButtons: {
        backgroundColor: "#FFD600",
        color: "#333333",
        borderColor: "#FFD600"
    },
    secondaryButtons: {
        backgroundColor: "transparent",
        color: "#6c757d",
        borderColor: "#6c757d"
    }
};

// Plugin configuration
const pluginVars = {
    "primary_color": "#FFD600",
    "projectId": 39,
    "apiPageAuthId": "46|j7vCLmx2KG70Ig8R5mtUcNMFcHExvFPZEOv31kKGe1033f2b",
    "apiBaseUrl": "https://api.efcloud.app",
    "idle_timeout": "30",
    "camera_quality": "high",
    "enable_filters": true,
    "max_photos": 3
};

const assetList = {
    "main_logo": "https://dashboard.eventfinity.test/storage/assets/69/2HyPwh1692319982.png",
    "background_image": "https://dashboard.eventfinity.test/storage/assets/69/2HyPwh1692319982.png",
    "instruction_image": "https://dashboard.eventfinity.test/storage/assets/69/2HyPwh1692319982.png"
};

const stringsList = {
    "start_line_one": "Welcome to Photo Kiosk!",
    "start_line_two": "Create amazing photos with AI enhancement",
    "start_touch_start": "Touch to begin your photo experience",
    
    "instructions_line_one": "Photo Instructions",
    "instructions_line_two": "Follow these simple steps to create your perfect photo",
    "instructions_msg": "1. Position yourself in the frame\n2. Smile and look at the camera\n3. Wait for the countdown\n4. Stay still during capture",
    
    "camera_countdown_text": "Get ready...",
    "camera_capture_text": "Say cheese!",
    
    "result_line_one": "Your Photos Are Ready!",
    "result_line_two": "Choose your favorite version to share",
    "result_line_three": "Select a photo below",
    
    "share_line_one": "Share Your Creation",
    "share_line_two": "Let others see your amazing photo",
    "share_email_placeholder": "Enter your email",
    "share_phone_placeholder": "Enter your phone number",
    
    "final_line_one": "Thank You!",
    "final_line_two": "Your photo has been saved and shared successfully",
    "final_line_three": "Touch anywhere to create another photo",
    
    "welcome_text": "Photo Kiosk Experience"
};

const dependencyList = {
    "project_location": 4,
    "photo_processor": 12,
    "share_service": 8
};

const permissionFlags = ["camera", "microphone", "location"];

// Error modal configuration
const errorModalConfig = ref({
    title: 'Oops! Something went wrong',
    messages: errorMessages,
    right_button_text: 'Try Again',
    right_button_action: () => {
        showErrorModal.value = false;
        clearErrors();
    }
});

// Socket configuration
const sockets = {};
sockets['primary'] = {
    broadcast: function (event, data) {
        socket.emit(event, data);
    },
    listen: function (event, callback) {
        return socket.on(event, callback);
    },
};

sockets['project_location'] = {
    created: {
        listen: function (event, data) {
            console.log('Location created:', data);
            return {};
        },
    },
    updated: {
        listen: function (event, callback) {
            console.log('Location updated');
            return {};
        },
    },
    deleted: {
        listen: function (event, callback) {
            console.log('Location deleted');
            return {};
        },
    },
};

// Lifecycle
onMounted(() => {
    console.log('Kiosk app initialized');
    
    // Set up error handling
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', (event) => {
        handleError(new Error(event.reason));
    });
});

// Expose functions for debugging
window.kioskApp = {
    goToPage,
    resetToStart,
    showLoading,
    hideLoading,
    currentPage: currentPage.value,
    theme,
    pluginVars
};

console.log('Kiosk app configuration:', {
    pluginVars,
    stringsList,
    assetList,
    theme,
    dependencyList,
    permissionFlags
});
</script>

<style>
#app {
    font-family: Avenir, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100vh;
    overflow: hidden;
}

/* Global kiosk styles */
* {
    box-sizing: border-box;
}

body {
    margin: 0;
    padding: 0;
    touch-action: manipulation; /* Prevent zoom on touch devices */
}

/* Disable text selection for kiosk mode */
.kiosk-mode {
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
}

/* Custom scrollbar for kiosk */
::-webkit-scrollbar {
    width: 8px;
}

::-webkit-scrollbar-track {
    background: #f1f1f1;
}

::-webkit-scrollbar-thumb {
    background: var(--gx-primary-color, #FFD600);
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: #e6c200;
}
</style> 