<template>
    <Teleport to="body">
        <div class="gx-devtools-overlay" @click.self="$emit('close')">
            <div class="gx-devtools-modal">
                <header class="gx-devtools-header">
                    <h2>GxP Dev Tools</h2>
                    <div class="gx-devtools-tabs">
                        <button
                            v-for="tab in tabs"
                            :key="tab.id"
                            :class="['gx-devtools-tab', { active: activeTab === tab.id }]"
                            @click="activeTab = tab.id"
                        >
                            {{ tab.label }}
                        </button>
                    </div>
                    <button class="gx-devtools-close" @click="$emit('close')" title="Close (Esc)">
                        &times;
                    </button>
                </header>

                <main class="gx-devtools-content">
                    <StoreInspector
                        v-if="activeTab === 'store'"
                        :store="store"
                    />
                    <LayoutSwitcher
                        v-else-if="activeTab === 'layout'"
                        :current-layout="currentLayout"
                        @change-layout="$emit('change-layout', $event)"
                    />
                    <SocketSimulator
                        v-else-if="activeTab === 'socket'"
                        :store="store"
                    />
                    <MockDataEditor
                        v-else-if="activeTab === 'data'"
                        :store="store"
                    />
                </main>

                <footer class="gx-devtools-footer">
                    <span class="gx-devtools-hint">
                        Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> or <kbd>Esc</kbd> to close
                    </span>
                    <span class="gx-devtools-version">GxP Toolkit Dev Tools</span>
                </footer>
            </div>
        </div>
    </Teleport>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import StoreInspector from './StoreInspector.vue';
import LayoutSwitcher from './LayoutSwitcher.vue';
import SocketSimulator from './SocketSimulator.vue';
import MockDataEditor from './MockDataEditor.vue';

const props = defineProps({
    store: {
        type: Object,
        required: true
    },
    currentLayout: {
        type: String,
        default: 'public'
    }
});

const emit = defineEmits(['close', 'change-layout']);

const tabs = [
    { id: 'store', label: 'Store' },
    { id: 'layout', label: 'Layout' },
    { id: 'socket', label: 'Socket' },
    { id: 'data', label: 'Mock Data' }
];

const activeTab = ref('store');

// Handle escape key to close
function handleKeydown(e) {
    if (e.key === 'Escape') {
        emit('close');
    }
}

onMounted(() => {
    document.addEventListener('keydown', handleKeydown);
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
});

onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
    document.body.style.overflow = '';
});
</script>

<style scoped>
.gx-devtools-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
}

.gx-devtools-modal {
    background: #1e1e1e;
    color: #e0e0e0;
    border-radius: 8px;
    width: 90%;
    max-width: 900px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    overflow: hidden;
}

.gx-devtools-header {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    background: #2d2d2d;
    border-bottom: 1px solid #3d3d3d;
    gap: 16px;
}

.gx-devtools-header h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #61dafb;
    white-space: nowrap;
}

.gx-devtools-tabs {
    display: flex;
    gap: 4px;
    flex: 1;
}

.gx-devtools-tab {
    background: transparent;
    border: none;
    color: #888;
    padding: 6px 12px;
    cursor: pointer;
    border-radius: 4px;
    font-size: 13px;
    transition: all 0.2s;
}

.gx-devtools-tab:hover {
    color: #e0e0e0;
    background: #3d3d3d;
}

.gx-devtools-tab.active {
    color: #61dafb;
    background: #3d3d3d;
}

.gx-devtools-close {
    background: transparent;
    border: none;
    color: #888;
    font-size: 24px;
    cursor: pointer;
    padding: 0 8px;
    line-height: 1;
    transition: color 0.2s;
}

.gx-devtools-close:hover {
    color: #ff6b6b;
}

.gx-devtools-content {
    flex: 1;
    overflow: auto;
    padding: 16px;
    min-height: 400px;
}

.gx-devtools-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    background: #2d2d2d;
    border-top: 1px solid #3d3d3d;
    font-size: 11px;
    color: #666;
}

.gx-devtools-hint kbd {
    background: #3d3d3d;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: inherit;
    font-size: 10px;
}

.gx-devtools-version {
    color: #555;
}
</style>
