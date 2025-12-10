<template>
    <div class="mock-data-editor">
        <div class="editor-description">
            <p>
                Edit mock data that simulates platform responses during development.
                Changes are applied in memory and will reset on page reload.
            </p>
        </div>

        <div class="data-sections">
            <div class="data-section">
                <div class="section-header" @click="toggleSection('theme')">
                    <span class="toggle-icon">{{ expandedSections.theme ? '▼' : '▶' }}</span>
                    <h4>Theme Settings</h4>
                </div>
                <div v-if="expandedSections.theme" class="section-content">
                    <div class="color-grid">
                        <div v-for="(value, key) in themeColors" :key="key" class="color-field">
                            <label>{{ formatLabel(key) }}</label>
                            <div class="color-input-wrapper">
                                <input
                                    type="color"
                                    :value="extractColor(value)"
                                    @input="updateThemeColor(key, $event.target.value)"
                                    class="color-picker"
                                />
                                <input
                                    type="text"
                                    :value="value"
                                    @input="updateThemeColor(key, $event.target.value)"
                                    class="color-text"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="data-section">
                <div class="section-header" @click="toggleSection('navigation')">
                    <span class="toggle-icon">{{ expandedSections.navigation ? '▼' : '▶' }}</span>
                    <h4>Navigation Items</h4>
                </div>
                <div v-if="expandedSections.navigation" class="section-content">
                    <div class="nav-items">
                        <div
                            v-for="(item, index) in navigationItems"
                            :key="index"
                            class="nav-item"
                        >
                            <input
                                v-model="item.title"
                                class="nav-input"
                                placeholder="Title"
                            />
                            <input
                                v-model="item.route"
                                class="nav-input"
                                placeholder="Route"
                            />
                            <button class="btn-icon" @click="removeNavItem(index)" title="Remove">
                                &times;
                            </button>
                        </div>
                        <button class="btn-add" @click="addNavItem">
                            + Add Navigation Item
                        </button>
                    </div>
                </div>
            </div>

            <div class="data-section">
                <div class="section-header" @click="toggleSection('user')">
                    <span class="toggle-icon">{{ expandedSections.user ? '▼' : '▶' }}</span>
                    <h4>User Session</h4>
                </div>
                <div v-if="expandedSections.user" class="section-content">
                    <div class="user-fields">
                        <div class="field-row">
                            <label>Authenticated:</label>
                            <label class="toggle-switch">
                                <input type="checkbox" v-model="userSession.authenticated" />
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                        <div class="field-row">
                            <label>User ID:</label>
                            <input
                                type="text"
                                v-model="userSession.userId"
                                class="field-input"
                            />
                        </div>
                        <div class="field-row">
                            <label>Username:</label>
                            <input
                                type="text"
                                v-model="userSession.username"
                                class="field-input"
                            />
                        </div>
                        <div class="field-row">
                            <label>Email:</label>
                            <input
                                type="email"
                                v-model="userSession.email"
                                class="field-input"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div class="data-section">
                <div class="section-header" @click="toggleSection('permissions')">
                    <span class="toggle-icon">{{ expandedSections.permissions ? '▼' : '▶' }}</span>
                    <h4>Permission Flags</h4>
                </div>
                <div v-if="expandedSections.permissions" class="section-content">
                    <div class="permissions-list">
                        <label
                            v-for="flag in availablePermissions"
                            :key="flag"
                            class="permission-item"
                        >
                            <input
                                type="checkbox"
                                :checked="activePermissions.includes(flag)"
                                @change="togglePermission(flag)"
                            />
                            <span>{{ flag }}</span>
                        </label>
                        <div class="add-permission">
                            <input
                                v-model="newPermission"
                                placeholder="Add custom permission..."
                                class="field-input"
                                @keydown.enter="addPermission"
                            />
                            <button class="btn-add-sm" @click="addPermission">Add</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="editor-actions">
            <button class="btn btn-secondary" @click="resetAllData">
                Reset All to Defaults
            </button>
            <button class="btn btn-primary" @click="exportData">
                Export as JSON
            </button>
        </div>
    </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';

const props = defineProps({
    store: {
        type: Object,
        required: true
    }
});

const expandedSections = reactive({
    theme: true,
    navigation: false,
    user: false,
    permissions: false
});

const themeColors = reactive({
    background_color: '#ffffff',
    text_color: '#333333',
    primary_color: '#FFD600',
    start_background_color: '#667eea',
    start_text_color: '#ffffff',
    final_background_color: '#4CAF50',
    final_text_color: '#ffffff'
});

const navigationItems = reactive([
    { title: 'Start', route: '/start' },
    { title: 'Plugin', route: '/plugin' },
    { title: 'Final', route: '/final' },
    { title: 'Logout', route: '/logout', system_type: 'logout' }
]);

const userSession = reactive({
    authenticated: false,
    userId: '',
    username: '',
    email: ''
});

const availablePermissions = ref([
    'admin',
    'editor',
    'viewer',
    'can_upload',
    'can_delete',
    'can_share'
]);

const activePermissions = ref([]);
const newPermission = ref('');

function toggleSection(section) {
    expandedSections[section] = !expandedSections[section];
}

function formatLabel(key) {
    return key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
}

function extractColor(value) {
    // Extract hex color from value (handle gradients, etc.)
    if (typeof value !== 'string') return '#ffffff';
    const match = value.match(/#[0-9A-Fa-f]{6}/);
    return match ? match[0] : '#ffffff';
}

function updateThemeColor(key, value) {
    themeColors[key] = value;
    // Update store if available
    if (props.store?.theme) {
        props.store.theme[key] = value;
    }
    console.log(`[DevTools] Theme ${key} updated:`, value);
}

function addNavItem() {
    navigationItems.push({ title: '', route: '' });
}

function removeNavItem(index) {
    navigationItems.splice(index, 1);
}

function togglePermission(flag) {
    const index = activePermissions.value.indexOf(flag);
    if (index > -1) {
        activePermissions.value.splice(index, 1);
    } else {
        activePermissions.value.push(flag);
    }
    // Update store
    if (props.store?.permissionFlags) {
        props.store.permissionFlags.splice(0, props.store.permissionFlags.length, ...activePermissions.value);
    }
    console.log('[DevTools] Permissions updated:', activePermissions.value);
}

function addPermission() {
    if (newPermission.value && !availablePermissions.value.includes(newPermission.value)) {
        availablePermissions.value.push(newPermission.value);
        activePermissions.value.push(newPermission.value);
        newPermission.value = '';
    }
}

function resetAllData() {
    // Reset theme
    Object.assign(themeColors, {
        background_color: '#ffffff',
        text_color: '#333333',
        primary_color: '#FFD600',
        start_background_color: '#667eea',
        start_text_color: '#ffffff',
        final_background_color: '#4CAF50',
        final_text_color: '#ffffff'
    });

    // Reset navigation
    navigationItems.splice(0, navigationItems.length,
        { title: 'Start', route: '/start' },
        { title: 'Plugin', route: '/plugin' },
        { title: 'Final', route: '/final' },
        { title: 'Logout', route: '/logout', system_type: 'logout' }
    );

    // Reset user
    Object.assign(userSession, {
        authenticated: false,
        userId: '',
        username: '',
        email: ''
    });

    // Reset permissions
    activePermissions.value = [];

    console.log('[DevTools] All mock data reset to defaults');
}

async function exportData() {
    const data = {
        theme: { ...themeColors },
        navigation: [...navigationItems],
        userSession: { ...userSession },
        permissions: [...activePermissions.value]
    };

    try {
        await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        console.log('[DevTools] Mock data exported to clipboard');
    } catch (err) {
        console.error('[DevTools] Failed to export:', err);
    }
}
</script>

<style scoped>
.mock-data-editor {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.editor-description {
    background: #2d2d2d;
    padding: 12px 16px;
    border-radius: 8px;
}

.editor-description p {
    margin: 0;
    font-size: 13px;
    color: #888;
}

.data-sections {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.data-section {
    background: #2d2d2d;
    border-radius: 8px;
    overflow: hidden;
}

.section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    cursor: pointer;
    transition: background 0.2s;
}

.section-header:hover {
    background: #3d3d3d;
}

.section-header h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
}

.toggle-icon {
    font-size: 10px;
    color: #888;
    width: 12px;
}

.section-content {
    padding: 12px 16px;
    border-top: 1px solid #3d3d3d;
}

/* Theme Colors */
.color-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
}

.color-field label {
    display: block;
    font-size: 11px;
    color: #888;
    margin-bottom: 4px;
}

.color-input-wrapper {
    display: flex;
    gap: 8px;
}

.color-picker {
    width: 40px;
    height: 32px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    background: transparent;
}

.color-text {
    flex: 1;
    background: #1e1e1e;
    border: 1px solid #3d3d3d;
    color: #e0e0e0;
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-family: 'SF Mono', Monaco, monospace;
}

/* Navigation */
.nav-items {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.nav-item {
    display: flex;
    gap: 8px;
    align-items: center;
}

.nav-input {
    flex: 1;
    background: #1e1e1e;
    border: 1px solid #3d3d3d;
    color: #e0e0e0;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
}

.btn-icon {
    background: transparent;
    border: none;
    color: #888;
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
}

.btn-icon:hover {
    color: #ff6b6b;
}

.btn-add {
    background: #3d3d3d;
    border: 1px dashed #555;
    color: #888;
    padding: 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    text-align: center;
    transition: all 0.2s;
}

.btn-add:hover {
    background: #4d4d4d;
    color: #e0e0e0;
}

/* User Session */
.user-fields {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.field-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.field-row > label:first-child {
    min-width: 100px;
    font-size: 12px;
    color: #888;
}

.field-input {
    flex: 1;
    background: #1e1e1e;
    border: 1px solid #3d3d3d;
    color: #e0e0e0;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
}

/* Toggle Switch */
.toggle-switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
}

.toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
}

.toggle-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #3d3d3d;
    transition: 0.3s;
    border-radius: 24px;
}

.toggle-slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: #888;
    transition: 0.3s;
    border-radius: 50%;
}

input:checked + .toggle-slider {
    background-color: #61dafb;
}

input:checked + .toggle-slider:before {
    transform: translateX(20px);
    background-color: #1e1e1e;
}

/* Permissions */
.permissions-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.permission-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    cursor: pointer;
}

.permission-item input[type="checkbox"] {
    accent-color: #61dafb;
}

.add-permission {
    display: flex;
    gap: 8px;
    margin-top: 8px;
}

.btn-add-sm {
    background: #3d3d3d;
    border: none;
    color: #e0e0e0;
    padding: 8px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
}

.btn-add-sm:hover {
    background: #4d4d4d;
}

/* Actions */
.editor-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding-top: 16px;
    border-top: 1px solid #3d3d3d;
}

.btn {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
}

.btn-primary {
    background: #61dafb;
    color: #1e1e1e;
}

.btn-primary:hover {
    background: #4fc3f7;
}

.btn-secondary {
    background: #3d3d3d;
    color: #e0e0e0;
}

.btn-secondary:hover {
    background: #4d4d4d;
}
</style>
