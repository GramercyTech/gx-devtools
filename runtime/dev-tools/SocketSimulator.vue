<template>
    <div class="socket-simulator">
        <div class="simulator-header">
            <div class="connection-status" :class="{ connected: isConnected }">
                <span class="status-dot"></span>
                {{ isConnected ? 'Connected' : 'Disconnected' }}
            </div>
            <span class="socket-port">Port: {{ socketPort }}</span>
        </div>

        <div class="event-list">
            <h4>Available Events</h4>
            <p class="helper-text">
                Click an event to send it. Events are loaded from <code>socket-events/</code> directory.
            </p>

            <div v-if="events.length === 0" class="empty-state">
                <p>No socket events found.</p>
                <p class="hint">Create JSON files in <code>socket-events/</code> to add events.</p>
            </div>

            <div v-else class="events-grid">
                <div
                    v-for="event in events"
                    :key="event.name"
                    class="event-card"
                    @click="selectEvent(event)"
                    :class="{ selected: selectedEvent?.name === event.name }"
                >
                    <div class="event-name">{{ event.name }}</div>
                    <div class="event-type">{{ event.event }}</div>
                </div>
            </div>
        </div>

        <div v-if="selectedEvent" class="event-editor">
            <h4>Event Details: {{ selectedEvent.name }}</h4>

            <div class="editor-field">
                <label>Event Type:</label>
                <input v-model="editableEvent.event" class="field-input" />
            </div>

            <div class="editor-field">
                <label>Channel:</label>
                <input v-model="editableEvent.channel" class="field-input" />
            </div>

            <div class="editor-field">
                <label>Data (JSON):</label>
                <textarea
                    v-model="editableEventData"
                    class="field-textarea"
                    rows="8"
                    @input="validateJson"
                ></textarea>
                <span v-if="jsonError" class="json-error">{{ jsonError }}</span>
            </div>

            <div class="editor-actions">
                <button class="btn btn-primary" @click="sendEvent" :disabled="!!jsonError">
                    Send Event
                </button>
                <button class="btn btn-secondary" @click="resetEvent">
                    Reset
                </button>
            </div>
        </div>

        <div class="event-log">
            <div class="log-header">
                <h4>Event Log</h4>
                <button class="btn-clear" @click="clearLog">Clear</button>
            </div>
            <div class="log-entries">
                <div v-if="eventLog.length === 0" class="empty-log">
                    No events sent yet
                </div>
                <div
                    v-for="(entry, index) in eventLog"
                    :key="index"
                    class="log-entry"
                    :class="entry.type"
                >
                    <span class="log-time">{{ entry.time }}</span>
                    <span class="log-direction">{{ entry.direction }}</span>
                    <span class="log-event">{{ entry.event }}</span>
                    <span class="log-status">{{ entry.status }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';

const props = defineProps({
    store: {
        type: Object,
        required: true
    }
});

const socketPort = ref(3069);
const isConnected = ref(false);
const events = ref([]);
const selectedEvent = ref(null);
const editableEvent = reactive({
    event: '',
    channel: '',
    data: {}
});
const editableEventData = ref('');
const jsonError = ref('');
const eventLog = ref([]);

// Default events if none are loaded
const defaultEvents = [
    {
        name: 'AiSessionMessageCreated',
        event: 'AiSessionMessageCreated',
        channel: 'private.ai_session.1',
        data: {
            id: 1,
            message: 'Test AI response',
            session_id: 1,
            created_at: new Date().toISOString()
        }
    },
    {
        name: 'SocialStreamPostCreated',
        event: 'SocialStreamPostCreated',
        channel: 'private.social_stream.1',
        data: {
            id: 1,
            content: 'Test social post',
            author: 'Test User',
            created_at: new Date().toISOString()
        }
    },
    {
        name: 'StateChange',
        event: 'state-change',
        channel: 'broadcast',
        data: {
            key: 'test_key',
            value: 'test_value',
            timestamp: new Date().toISOString()
        }
    }
];

onMounted(() => {
    // Load events - in a real implementation, this would load from socket-events directory
    events.value = defaultEvents;

    // Check socket connection
    checkConnection();
});

function checkConnection() {
    // Try to connect to socket server
    const socket = props.store?.sockets?.primary;
    isConnected.value = !!socket;
}

function selectEvent(event) {
    selectedEvent.value = event;
    editableEvent.event = event.event;
    editableEvent.channel = event.channel;
    editableEvent.data = { ...event.data };
    editableEventData.value = JSON.stringify(event.data, null, 2);
    jsonError.value = '';
}

function validateJson() {
    try {
        JSON.parse(editableEventData.value);
        jsonError.value = '';
    } catch (e) {
        jsonError.value = 'Invalid JSON: ' + e.message;
    }
}

function resetEvent() {
    if (selectedEvent.value) {
        selectEvent(selectedEvent.value);
    }
}

async function sendEvent() {
    if (jsonError.value) return;

    let data;
    try {
        data = JSON.parse(editableEventData.value);
    } catch {
        return;
    }

    const eventPayload = {
        event: editableEvent.event,
        channel: editableEvent.channel,
        data: data
    };

    // Log the send attempt
    addLogEntry('send', editableEvent.event, 'pending');

    try {
        // Try to send via the store's socket
        const socket = props.store?.sockets?.primary;
        if (socket && socket.broadcast) {
            socket.broadcast(editableEvent.event, data);
            updateLastLogEntry('success');
            console.log('[DevTools] Socket event sent:', eventPayload);
        } else {
            // Fallback: try to send via HTTP to the socket server
            const response = await fetch(`https://localhost:${socketPort.value}/emit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(eventPayload)
            });

            if (response.ok) {
                updateLastLogEntry('success');
                console.log('[DevTools] Socket event sent via HTTP:', eventPayload);
            } else {
                throw new Error('HTTP request failed');
            }
        }
    } catch (err) {
        updateLastLogEntry('error');
        console.error('[DevTools] Failed to send event:', err);
    }
}

function addLogEntry(direction, event, status) {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour12: false });

    eventLog.value.unshift({
        time,
        direction: direction === 'send' ? '→' : '←',
        event,
        status,
        type: status
    });

    // Keep only last 50 entries
    if (eventLog.value.length > 50) {
        eventLog.value.pop();
    }
}

function updateLastLogEntry(status) {
    if (eventLog.value.length > 0) {
        eventLog.value[0].status = status;
        eventLog.value[0].type = status;
    }
}

function clearLog() {
    eventLog.value = [];
}
</script>

<style scoped>
.socket-simulator {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.simulator-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: #2d2d2d;
    border-radius: 8px;
}

.connection-status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #ff6b6b;
}

.connection-status.connected {
    color: #51cf66;
}

.status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
}

.socket-port {
    font-size: 12px;
    color: #888;
    font-family: 'SF Mono', Monaco, monospace;
}

.event-list h4,
.event-editor h4,
.event-log h4 {
    margin: 0 0 8px 0;
    font-size: 13px;
    color: #e0e0e0;
}

.helper-text {
    font-size: 12px;
    color: #888;
    margin: 0 0 12px 0;
}

.helper-text code,
.hint code {
    background: #3d3d3d;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 11px;
}

.empty-state {
    padding: 20px;
    text-align: center;
    color: #666;
    background: #2d2d2d;
    border-radius: 8px;
}

.empty-state p {
    margin: 0;
}

.hint {
    font-size: 11px;
    margin-top: 8px !important;
}

.events-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
}

.event-card {
    background: #2d2d2d;
    border-radius: 8px;
    padding: 12px;
    cursor: pointer;
    border: 2px solid transparent;
    transition: all 0.2s;
}

.event-card:hover {
    border-color: #3d3d3d;
    background: #333;
}

.event-card.selected {
    border-color: #61dafb;
    background: #2a3a4a;
}

.event-name {
    font-size: 13px;
    font-weight: 500;
    color: #e0e0e0;
    margin-bottom: 4px;
}

.event-type {
    font-size: 11px;
    color: #888;
    font-family: 'SF Mono', Monaco, monospace;
}

.event-editor {
    background: #2d2d2d;
    border-radius: 8px;
    padding: 16px;
}

.editor-field {
    margin-bottom: 12px;
}

.editor-field label {
    display: block;
    font-size: 12px;
    color: #888;
    margin-bottom: 4px;
}

.field-input,
.field-textarea {
    width: 100%;
    background: #1e1e1e;
    border: 1px solid #3d3d3d;
    color: #e0e0e0;
    padding: 8px 12px;
    border-radius: 4px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 12px;
    box-sizing: border-box;
}

.field-input:focus,
.field-textarea:focus {
    outline: none;
    border-color: #61dafb;
}

.field-textarea {
    resize: vertical;
    min-height: 100px;
}

.json-error {
    display: block;
    color: #ff6b6b;
    font-size: 11px;
    margin-top: 4px;
}

.editor-actions {
    display: flex;
    gap: 8px;
    margin-top: 16px;
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

.btn-primary:disabled {
    background: #3d3d3d;
    color: #666;
    cursor: not-allowed;
}

.btn-secondary {
    background: #3d3d3d;
    color: #e0e0e0;
}

.btn-secondary:hover {
    background: #4d4d4d;
}

.event-log {
    background: #2d2d2d;
    border-radius: 8px;
    overflow: hidden;
}

.log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid #3d3d3d;
}

.log-header h4 {
    margin: 0;
}

.btn-clear {
    background: transparent;
    border: none;
    color: #888;
    cursor: pointer;
    font-size: 11px;
}

.btn-clear:hover {
    color: #e0e0e0;
}

.log-entries {
    max-height: 200px;
    overflow-y: auto;
}

.empty-log {
    padding: 20px;
    text-align: center;
    color: #666;
    font-size: 12px;
}

.log-entry {
    display: flex;
    gap: 12px;
    padding: 8px 16px;
    font-size: 11px;
    font-family: 'SF Mono', Monaco, monospace;
    border-bottom: 1px solid #252525;
}

.log-entry:last-child {
    border-bottom: none;
}

.log-time {
    color: #666;
    min-width: 70px;
}

.log-direction {
    color: #61dafb;
}

.log-event {
    color: #e0e0e0;
    flex: 1;
}

.log-status {
    min-width: 60px;
    text-align: right;
}

.log-entry.success .log-status {
    color: #51cf66;
}

.log-entry.error .log-status {
    color: #ff6b6b;
}

.log-entry.pending .log-status {
    color: #ffd43b;
}
</style>
