<template>
    <div class="store-inspector">
        <div class="inspector-section">
            <h3 class="section-title" @click="toggleSection('pluginVars')">
                <span class="toggle-icon">{{ expandedSections.pluginVars ? '▼' : '▶' }}</span>
                Plugin Variables
                <span class="item-count">{{ Object.keys(store.pluginVars || {}).length }}</span>
            </h3>
            <div v-if="expandedSections.pluginVars" class="section-content">
                <div v-if="Object.keys(store.pluginVars || {}).length === 0" class="empty-state">
                    No plugin variables defined
                </div>
                <div v-else class="property-list">
                    <div
                        v-for="(value, key) in store.pluginVars"
                        :key="key"
                        class="property-item"
                        @mouseenter="highlightElements('gxp-settings', key)"
                        @mouseleave="clearHighlight()"
                    >
                        <span class="property-key">{{ key }}</span>
                        <input
                            v-if="editingKey === `pluginVars.${key}`"
                            v-model="editValue"
                            class="property-input"
                            @blur="saveEdit('pluginVars', key)"
                            @keydown.enter="saveEdit('pluginVars', key)"
                            @keydown.escape="cancelEdit"
                            ref="editInput"
                        />
                        <span
                            v-else
                            class="property-value"
                            :class="getValueType(value)"
                            @dblclick="startEdit('pluginVars', key, value)"
                            :title="'Double-click to edit'"
                        >
                            {{ formatValue(value) }}
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <div class="inspector-section">
            <h3 class="section-title" @click="toggleSection('stringsList')">
                <span class="toggle-icon">{{ expandedSections.stringsList ? '▼' : '▶' }}</span>
                Strings List
                <span class="item-count">{{ Object.keys(store.stringsList || {}).length }}</span>
            </h3>
            <div v-if="expandedSections.stringsList" class="section-content">
                <div v-if="Object.keys(store.stringsList || {}).length === 0" class="empty-state">
                    No strings defined
                </div>
                <div v-else class="property-list">
                    <div
                        v-for="(value, key) in store.stringsList"
                        :key="key"
                        class="property-item"
                        @mouseenter="highlightElements('gxp-string', key)"
                        @mouseleave="clearHighlight()"
                    >
                        <span class="property-key">{{ key }}</span>
                        <input
                            v-if="editingKey === `stringsList.${key}`"
                            v-model="editValue"
                            class="property-input"
                            @blur="saveEdit('stringsList', key)"
                            @keydown.enter="saveEdit('stringsList', key)"
                            @keydown.escape="cancelEdit"
                        />
                        <span
                            v-else
                            class="property-value string"
                            @dblclick="startEdit('stringsList', key, value)"
                            :title="'Double-click to edit'"
                        >
                            "{{ value }}"
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <div class="inspector-section">
            <h3 class="section-title" @click="toggleSection('assetList')">
                <span class="toggle-icon">{{ expandedSections.assetList ? '▼' : '▶' }}</span>
                Asset List
                <span class="item-count">{{ Object.keys(store.assetList || {}).length }}</span>
            </h3>
            <div v-if="expandedSections.assetList" class="section-content">
                <div v-if="Object.keys(store.assetList || {}).length === 0" class="empty-state">
                    No assets defined
                </div>
                <div v-else class="property-list">
                    <div
                        v-for="(value, key) in store.assetList"
                        :key="key"
                        class="property-item asset-item"
                        @mouseenter="highlightElements('gxp-src', key)"
                        @mouseleave="clearHighlight()"
                    >
                        <span class="property-key">{{ key }}</span>
                        <div class="asset-preview">
                            <img
                                v-if="isImageUrl(value)"
                                :src="value"
                                class="asset-thumbnail"
                                @error="(e) => e.target.style.display = 'none'"
                            />
                            <span class="property-value string" :title="value">
                                {{ truncateUrl(value) }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="inspector-section">
            <h3 class="section-title" @click="toggleSection('triggerState')">
                <span class="toggle-icon">{{ expandedSections.triggerState ? '▼' : '▶' }}</span>
                Trigger State
                <span class="item-count">{{ Object.keys(store.triggerState || {}).length }}</span>
            </h3>
            <div v-if="expandedSections.triggerState" class="section-content">
                <div v-if="Object.keys(store.triggerState || {}).length === 0" class="empty-state">
                    No trigger state defined
                </div>
                <div v-else class="property-list">
                    <div
                        v-for="(value, key) in store.triggerState"
                        :key="key"
                        class="property-item"
                        @mouseenter="highlightElements('gxp-state', key)"
                        @mouseleave="clearHighlight()"
                    >
                        <span class="property-key">{{ key }}</span>
                        <span class="property-value" :class="getValueType(value)">
                            {{ formatValue(value) }}
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <div class="inspector-section">
            <h3 class="section-title" @click="toggleSection('dependencyList')">
                <span class="toggle-icon">{{ expandedSections.dependencyList ? '▼' : '▶' }}</span>
                Dependencies
                <span class="item-count">{{ getDependencyCount() }}</span>
            </h3>
            <div v-if="expandedSections.dependencyList" class="section-content">
                <div v-if="getDependencyCount() === 0" class="empty-state">
                    No dependencies defined
                </div>
                <div v-else class="property-list">
                    <div
                        v-for="(value, key) in store.dependencyList"
                        :key="key"
                        class="property-item"
                    >
                        <span class="property-key">{{ key }}</span>
                        <span class="property-value" :class="getValueType(value)">
                            {{ formatValue(value) }}
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <div class="inspector-actions">
            <button class="action-btn" @click="refreshStore" title="Refresh store data">
                Refresh
            </button>
            <button class="action-btn" @click="copyStoreToClipboard" title="Copy store state to clipboard">
                Copy JSON
            </button>
        </div>
    </div>
</template>

<script setup>
import { ref, reactive, nextTick, onUnmounted } from 'vue';

const props = defineProps({
    store: {
        type: Object,
        required: true
    }
});

// Element highlighting
const highlightedElements = ref([]);
const highlightOverlays = ref([]);

const expandedSections = reactive({
    pluginVars: true,
    stringsList: false,
    assetList: false,
    triggerState: false,
    dependencyList: false
});

const editingKey = ref(null);
const editValue = ref('');

function toggleSection(section) {
    expandedSections[section] = !expandedSections[section];
}

function getValueType(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string') return 'string';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'unknown';
}

function formatValue(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'string') return `"${value}"`;
    if (Array.isArray(value)) return `Array(${value.length})`;
    if (typeof value === 'object') return `Object(${Object.keys(value).length})`;
    return String(value);
}

function isImageUrl(url) {
    if (typeof url !== 'string') return false;
    return /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url);
}

function truncateUrl(url, maxLength = 50) {
    if (typeof url !== 'string') return url;
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
}

function getDependencyCount() {
    const deps = props.store.dependencyList;
    if (!deps) return 0;
    if (Array.isArray(deps)) return deps.length;
    return Object.keys(deps).length;
}

function startEdit(section, key, value) {
    editingKey.value = `${section}.${key}`;
    editValue.value = typeof value === 'string' ? value : JSON.stringify(value);
    nextTick(() => {
        const input = document.querySelector('.property-input');
        if (input) input.focus();
    });
}

function saveEdit(section, key) {
    if (editingKey.value && props.store[section]) {
        let newValue = editValue.value;
        // Try to parse as JSON for non-string values
        try {
            const parsed = JSON.parse(newValue);
            newValue = parsed;
        } catch {
            // Keep as string if not valid JSON
        }

        // Use the store's update methods to ensure Vue reactivity triggers properly
        // This will update any gxp-string/gxp-src directives that depend on these values
        if (section === 'stringsList' && typeof props.store.updateString === 'function') {
            props.store.updateString(key, newValue);
        } else if (section === 'pluginVars' && typeof props.store.updateSetting === 'function') {
            props.store.updateSetting(key, newValue);
        } else if (section === 'assetList' && typeof props.store.updateAsset === 'function') {
            props.store.updateAsset(key, newValue);
        } else if (section === 'triggerState' && typeof props.store.updateState === 'function') {
            props.store.updateState(key, newValue);
        } else {
            // Fallback for older stores without update methods
            props.store[section][key] = newValue;
        }
        console.log(`[DevTools] Updated ${section}.${key}:`, newValue);
    }
    cancelEdit();
}

function cancelEdit() {
    editingKey.value = null;
    editValue.value = '';
}

function refreshStore() {
    // Force reactivity update
    console.log('[DevTools] Store refreshed');
}

async function copyStoreToClipboard() {
    const storeData = {
        pluginVars: props.store.pluginVars,
        stringsList: props.store.stringsList,
        assetList: props.store.assetList,
        triggerState: props.store.triggerState,
        dependencyList: props.store.dependencyList
    };

    try {
        await navigator.clipboard.writeText(JSON.stringify(storeData, null, 2));
        console.log('[DevTools] Store data copied to clipboard');
    } catch (err) {
        console.error('[DevTools] Failed to copy:', err);
    }
}

/**
 * Element highlighting functions
 * Creates overlay boxes that highlight elements using gxp-* attributes
 */

// CSS class name for our highlight overlay
const HIGHLIGHT_CLASS = 'gxp-devtools-highlight-overlay';

// Inject highlight styles into the document if not already present
function ensureHighlightStyles() {
    if (document.getElementById('gxp-devtools-highlight-styles')) return;

    const style = document.createElement('style');
    style.id = 'gxp-devtools-highlight-styles';
    style.textContent = `
        .${HIGHLIGHT_CLASS} {
            position: fixed;
            pointer-events: none;
            z-index: 99998;
            background: rgba(97, 218, 251, 0.15);
            border: 2px solid #61dafb;
            border-radius: 4px;
            box-shadow: 0 0 10px rgba(97, 218, 251, 0.5), inset 0 0 10px rgba(97, 218, 251, 0.1);
            animation: gxp-highlight-pulse 1.5s ease-in-out infinite;
        }
        .${HIGHLIGHT_CLASS}::before {
            content: attr(data-gxp-key);
            position: absolute;
            top: -22px;
            left: -2px;
            background: #61dafb;
            color: #1e1e1e;
            font-size: 10px;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 3px 3px 0 0;
            font-family: 'SF Mono', Monaco, 'Courier New', monospace;
            white-space: nowrap;
        }
        @keyframes gxp-highlight-pulse {
            0%, 100% { box-shadow: 0 0 10px rgba(97, 218, 251, 0.5), inset 0 0 10px rgba(97, 218, 251, 0.1); }
            50% { box-shadow: 0 0 20px rgba(97, 218, 251, 0.8), inset 0 0 15px rgba(97, 218, 251, 0.2); }
        }
    `;
    document.head.appendChild(style);
}

// Find elements that match a gxp attribute and key
function findMatchingElements(attribute, key) {
    const elements = [];

    // For stringsList, look for gxp-string attribute (without gxp-settings, gxp-assets, gxp-state)
    // For pluginVars (gxp-settings), look for gxp-string with gxp-settings modifier
    // For assetList (gxp-src), look for gxp-src attribute
    // For triggerState (gxp-state), look for gxp-string or gxp-src with gxp-state modifier

    if (attribute === 'gxp-string') {
        // Find elements with gxp-string="key" that don't have modifiers
        document.querySelectorAll(`[gxp-string="${key}"]`).forEach(el => {
            if (!el.hasAttribute('gxp-settings') && !el.hasAttribute('gxp-assets') && !el.hasAttribute('gxp-state')) {
                elements.push(el);
            }
        });
    } else if (attribute === 'gxp-settings') {
        // Find elements with gxp-string="key" AND gxp-settings attribute
        document.querySelectorAll(`[gxp-string="${key}"][gxp-settings]`).forEach(el => {
            elements.push(el);
        });
    } else if (attribute === 'gxp-src') {
        // Find elements with gxp-src="key" that don't have gxp-state modifier
        document.querySelectorAll(`[gxp-src="${key}"]`).forEach(el => {
            if (!el.hasAttribute('gxp-state')) {
                elements.push(el);
            }
        });
        // Also check for gxp-string with gxp-assets modifier
        document.querySelectorAll(`[gxp-string="${key}"][gxp-assets]`).forEach(el => {
            elements.push(el);
        });
    } else if (attribute === 'gxp-state') {
        // Find elements with gxp-state modifier on either gxp-string or gxp-src
        document.querySelectorAll(`[gxp-string="${key}"][gxp-state]`).forEach(el => {
            elements.push(el);
        });
        document.querySelectorAll(`[gxp-src="${key}"][gxp-state]`).forEach(el => {
            elements.push(el);
        });
    }

    return elements;
}

// Create overlay for an element
function createOverlay(element, key) {
    const rect = element.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = HIGHLIGHT_CLASS;
    overlay.setAttribute('data-gxp-key', key);
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    document.body.appendChild(overlay);
    return overlay;
}

// Highlight elements matching a key
function highlightElements(attribute, key) {
    ensureHighlightStyles();
    clearHighlight();

    const elements = findMatchingElements(attribute, key);
    highlightedElements.value = elements;

    elements.forEach(el => {
        const overlay = createOverlay(el, key);
        highlightOverlays.value.push(overlay);
    });

    if (elements.length > 0) {
        console.log(`[DevTools] Highlighting ${elements.length} element(s) with ${attribute}="${key}"`);
    }
}

// Clear all highlight overlays
function clearHighlight() {
    highlightOverlays.value.forEach(overlay => {
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    });
    highlightOverlays.value = [];
    highlightedElements.value = [];
}

// Clean up on unmount
onUnmounted(() => {
    clearHighlight();
});
</script>

<style scoped>
.store-inspector {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.inspector-section {
    background: #2d2d2d;
    border-radius: 6px;
    overflow: hidden;
}

.section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 10px 12px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    user-select: none;
    transition: background 0.2s;
}

.section-title:hover {
    background: #3d3d3d;
}

.toggle-icon {
    font-size: 10px;
    color: #888;
    width: 12px;
}

.item-count {
    margin-left: auto;
    background: #3d3d3d;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    color: #888;
}

.section-content {
    padding: 8px 12px 12px;
    border-top: 1px solid #3d3d3d;
}

.empty-state {
    color: #666;
    font-size: 12px;
    font-style: italic;
    padding: 8px 0;
}

.property-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.property-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 12px;
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
}

.property-key {
    color: #9cdcfe;
    min-width: 140px;
    flex-shrink: 0;
}

.property-key::after {
    content: ':';
    color: #888;
}

.property-value {
    word-break: break-all;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
    transition: background 0.2s;
}

.property-value:hover {
    background: #3d3d3d;
}

.property-value.string {
    color: #ce9178;
}

.property-value.number {
    color: #b5cea8;
}

.property-value.boolean {
    color: #569cd6;
}

.property-value.null,
.property-value.undefined {
    color: #808080;
    font-style: italic;
}

.property-value.object,
.property-value.array {
    color: #dcdcaa;
}

.property-input {
    flex: 1;
    background: #3d3d3d;
    border: 1px solid #61dafb;
    color: #e0e0e0;
    padding: 4px 8px;
    border-radius: 3px;
    font-family: inherit;
    font-size: 12px;
    outline: none;
}

.asset-item {
    flex-direction: column;
    gap: 4px;
}

.asset-preview {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 148px;
}

.asset-thumbnail {
    width: 32px;
    height: 32px;
    object-fit: cover;
    border-radius: 4px;
    background: #3d3d3d;
}

.inspector-actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #3d3d3d;
}

.action-btn {
    background: #3d3d3d;
    border: none;
    color: #e0e0e0;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
}

.action-btn:hover {
    background: #4d4d4d;
    color: #61dafb;
}
</style>
