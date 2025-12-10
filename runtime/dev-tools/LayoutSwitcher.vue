<template>
    <div class="layout-switcher">
        <p class="switcher-description">
            Switch between different layout templates to preview how your plugin renders in various contexts.
        </p>

        <div class="layout-options">
            <div
                v-for="layout in layouts"
                :key="layout.id"
                :class="['layout-option', { active: currentLayout === layout.id }]"
                @click="$emit('change-layout', layout.id)"
            >
                <div class="layout-preview" :class="layout.id">
                    <div class="preview-header"></div>
                    <div class="preview-sidebar" v-if="layout.hasSidebar"></div>
                    <div class="preview-content"></div>
                    <div class="preview-footer" v-if="layout.hasFooter"></div>
                </div>
                <div class="layout-info">
                    <h4 class="layout-name">{{ layout.name }}</h4>
                    <p class="layout-desc">{{ layout.description }}</p>
                </div>
                <div v-if="currentLayout === layout.id" class="active-indicator">
                    Active
                </div>
            </div>
        </div>

        <div class="layout-details">
            <h4>Current Layout: {{ getCurrentLayoutName() }}</h4>
            <p class="layout-hint">
                Layouts are defined in <code>theme-layouts/</code> directory.
                Each layout receives portal settings, navigation, and assets as props.
            </p>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    currentLayout: {
        type: String,
        default: 'public'
    }
});

const emit = defineEmits(['change-layout']);

const layouts = [
    {
        id: 'public',
        name: 'Public Layout',
        description: 'Full-width layout for public-facing pages with no authentication required.',
        hasSidebar: false,
        hasFooter: true
    },
    {
        id: 'private',
        name: 'Private Layout',
        description: 'Layout with sidebar navigation for authenticated user experiences.',
        hasSidebar: true,
        hasFooter: true
    },
    {
        id: 'system',
        name: 'System Layout',
        description: 'Minimal layout for system pages like login, error screens, etc.',
        hasSidebar: false,
        hasFooter: false
    }
];

function getCurrentLayoutName() {
    const layout = layouts.find(l => l.id === props.currentLayout);
    return layout ? layout.name : props.currentLayout;
}
</script>

<style scoped>
.layout-switcher {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.switcher-description {
    color: #888;
    font-size: 13px;
    margin: 0;
}

.layout-options {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
}

.layout-option {
    background: #2d2d2d;
    border-radius: 8px;
    padding: 16px;
    cursor: pointer;
    border: 2px solid transparent;
    transition: all 0.2s;
    position: relative;
}

.layout-option:hover {
    border-color: #3d3d3d;
    background: #333;
}

.layout-option.active {
    border-color: #61dafb;
    background: #2a3a4a;
}

.layout-preview {
    height: 80px;
    background: #1e1e1e;
    border-radius: 4px;
    margin-bottom: 12px;
    position: relative;
    overflow: hidden;
    display: grid;
}

.layout-preview.public {
    grid-template-rows: 20px 1fr 16px;
}

.layout-preview.private {
    grid-template-columns: 30px 1fr;
    grid-template-rows: 20px 1fr 16px;
}

.layout-preview.system {
    grid-template-rows: 1fr;
}

.preview-header {
    background: #3d3d3d;
    grid-column: 1 / -1;
}

.preview-sidebar {
    background: #2d2d2d;
    grid-row: 2 / -1;
}

.preview-content {
    background: #252525;
}

.preview-footer {
    background: #3d3d3d;
    grid-column: 1 / -1;
}

.layout-info {
    text-align: center;
}

.layout-name {
    margin: 0 0 4px 0;
    font-size: 13px;
    font-weight: 500;
    color: #e0e0e0;
}

.layout-desc {
    margin: 0;
    font-size: 11px;
    color: #888;
    line-height: 1.4;
}

.active-indicator {
    position: absolute;
    top: 8px;
    right: 8px;
    background: #61dafb;
    color: #1e1e1e;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
}

.layout-details {
    background: #2d2d2d;
    border-radius: 8px;
    padding: 16px;
}

.layout-details h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: #61dafb;
}

.layout-hint {
    margin: 0;
    font-size: 12px;
    color: #888;
    line-height: 1.5;
}

.layout-hint code {
    background: #3d3d3d;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 11px;
    color: #e0e0e0;
}
</style>
