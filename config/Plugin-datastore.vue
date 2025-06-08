<template>
  <div class="plugin-container">
    <!-- Example usage of the GxP Datastore -->
    <div class="content-wrapper">
      <h1>{{ gxpStore.getString('welcome_text', 'Welcome!') }}</h1>
      
      <div class="info-section">
        <h2>Plugin Information</h2>
        <p><strong>Primary Color:</strong> {{ gxpStore.getSetting('primary_color') }}</p>
        <p><strong>Project ID:</strong> {{ gxpStore.getSetting('projectId') }}</p>
        <p><strong>Environment:</strong> {{ gxpStore.pluginData?.environment || 'development' }}</p>
      </div>

      <div class="assets-section">
        <h2>Assets</h2>
        <img 
          v-if="gxpStore.getAsset('main_logo')"
          :src="gxpStore.getAsset('main_logo')" 
          alt="Main Logo" 
          class="logo"
        />
        <div class="asset-controls">
          <button @click="addDevAssets" class="action-btn secondary small">
            Add Dev Assets
          </button>
          <button @click="listAllAssets" class="action-btn secondary small">
            List Assets
          </button>
          <button @click="updateLogo" class="action-btn secondary small">
            Update Logo
          </button>
        </div>
        <div v-if="currentAssets" class="asset-preview">
          <h3>Current Assets:</h3>
          <div v-for="(url, key) in currentAssets" :key="key" class="asset-item">
            <strong>{{ key }}:</strong> 
            <a :href="url" target="_blank" class="asset-link">{{ url }}</a>
          </div>
        </div>
      </div>

      <div class="actions-section">
        <button 
          @click="handleApiCall" 
          class="action-btn"
          :style="{ backgroundColor: gxpStore.getSetting('primary_color') }"
        >
          {{ gxpStore.getString('continue_button', 'Continue') }}
        </button>
        
        <button 
          @click="handleSocketTest" 
          class="action-btn secondary"
        >
          Test Socket
        </button>
        
        <button 
          @click="$emit('back')" 
          class="action-btn secondary"
        >
          {{ gxpStore.getString('back_button', 'Back') }}
        </button>
      </div>

      <div class="permissions-section">
        <h2>Permissions</h2>
        <ul>
          <li v-for="permission in ['can_access_camera', 'can_save_data', 'can_share_content']" :key="permission">
            {{ permission }}: 
            <span :class="gxpStore.hasPermission(permission) ? 'granted' : 'denied'">
              {{ gxpStore.hasPermission(permission) ? 'Granted' : 'Denied' }}
            </span>
          </li>
        </ul>
      </div>

      <div class="dependencies-section">
        <h2>Available Dependencies</h2>
        <div v-if="Array.isArray(gxpStore.dependencyList)">
          <div v-for="dependency in gxpStore.dependencyList" :key="dependency.identifier" class="dependency-item">
            <h3>{{ dependency.identifier }}</h3>
            <p><strong>Model:</strong> {{ dependency.model }}</p>
            <p><strong>Events:</strong> {{ Object.keys(dependency.events || {}).join(', ') || 'None' }}</p>
            <button 
              @click="testDependencyAPI(dependency.identifier)" 
              class="action-btn secondary small"
            >
              Test API
            </button>
            <button 
              v-if="dependency.events && Object.keys(dependency.events).length > 0"
              @click="setupDependencyListeners(dependency)" 
              class="action-btn secondary small"
            >
              Listen for Events
            </button>
          </div>
        </div>
        <div v-else>
          <ul>
            <li v-for="(id, key) in gxpStore.dependencyList" :key="key">
              {{ key }}: {{ id }}
            </li>
          </ul>
        </div>
      </div>

      <!-- Example of how to use socket listeners -->
      <div class="socket-section">
        <h2>Socket Events</h2>
        <button @click="emitTestEvent" class="action-btn secondary">
          Emit Test Event
        </button>
        <div v-if="socketMessages.length > 0" class="socket-messages">
          <h3>Received Messages:</h3>
          <ul>
            <li v-for="(message, index) in socketMessages" :key="index">
              {{ message }}
            </li>
          </ul>
        </div>
      </div>

      <!-- Complete button -->
      <div class="complete-section">
        <button 
          @click="$emit('complete')" 
          class="action-btn complete"
          :style="{ backgroundColor: gxpStore.getSetting('final_background_color') }"
        >
          Complete Experience
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plugin-container {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
  font-family: Arial, sans-serif;
}

.content-wrapper {
  background: white;
  border-radius: 8px;
  padding: 30px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

h1 {
  color: v-bind('gxpStore.getSetting("primary_color")');
  text-align: center;
  margin-bottom: 30px;
}

h2 {
  color: #333;
  border-bottom: 2px solid #eee;
  padding-bottom: 10px;
  margin: 20px 0 15px 0;
}

.info-section,
.assets-section,
.actions-section,
.permissions-section,
.dependencies-section,
.socket-section,
.complete-section {
  margin: 20px 0;
}

.logo {
  max-width: 200px;
  height: auto;
  display: block;
  margin: 10px 0;
}

.action-btn {
  background-color: #007bff;
  color: white;
  border: none;
  padding: 12px 24px;
  margin: 5px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  transition: background-color 0.3s;
}

.action-btn:hover {
  opacity: 0.9;
}

.action-btn.secondary {
  background-color: #6c757d;
}

.action-btn.complete {
  background-color: #28a745;
  font-size: 18px;
  padding: 15px 30px;
  display: block;
  margin: 20px auto 0;
}

.granted {
  color: #28a745;
  font-weight: bold;
}

.denied {
  color: #dc3545;
  font-weight: bold;
}

.socket-messages {
  background: #f8f9fa;
  padding: 15px;
  border-radius: 4px;
  margin-top: 10px;
}

.dependency-item {
  background: #f8f9fa;
  padding: 15px;
  margin: 10px 0;
  border-radius: 4px;
  border-left: 4px solid #007bff;
}

.dependency-item h3 {
  margin: 0 0 10px 0;
  color: #007bff;
}

.action-btn.small {
  padding: 8px 16px;
  font-size: 14px;
  margin: 2px;
}

ul {
  list-style-type: none;
  padding: 0;
}

li {
  padding: 5px 0;
  border-bottom: 1px solid #eee;
}

li:last-child {
  border-bottom: none;
}

.asset-controls {
  margin: 15px 0;
}

.asset-preview {
  background: #f8f9fa;
  padding: 15px;
  border-radius: 4px;
  margin-top: 15px;
}

.asset-preview h3 {
  margin: 0 0 10px 0;
  color: #333;
}

.asset-item {
  margin: 8px 0;
  padding: 8px;
  background: white;
  border-radius: 4px;
  border-left: 3px solid #007bff;
}

.asset-link {
  color: #007bff;
  text-decoration: none;
  word-break: break-all;
}

.asset-link:hover {
  text-decoration: underline;
}
</style>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
// Instead of:
// import { useGxpStore } from '@/stores/gxpPortalConfigStore';

// Use:
import { useStore } from '@/composables/useStore';

// Initialize the GxP store
const gxpStore = useStore(); // This will automatically use global or local store
// Define emits
defineEmits(['back', 'complete']);

// Local state
const socketMessages = ref([]);
const socketUnsubscribers = ref([]);
const currentAssets = ref(null);

// Example API call using the store
async function handleApiCall() {
  try {
    console.log('Making API call...');
    // Example API call - this would work with your actual API
    // const result = await gxpStore.apiGet('/some-endpoint');
    // console.log('API Result:', result);
    
    // For demo purposes, simulate API call
    setTimeout(() => {
      console.log('Simulated API call completed');
    }, 1000);
    
  } catch (error) {
    console.error('API call failed:', error);
  }
}

// Example dependency API call using new methods
async function testDependencyAPI(identifier) {
  try {
    console.log(`Testing API for dependency: ${identifier}`);
    
    // Example of the new getList method
    // const result = await gxpStore.getList(identifier, { page: 1, limit: 10 });
    // console.log(`API Result for ${identifier}:`, result);
    
    // For demo purposes, simulate API call
    socketMessages.value.unshift(`API call simulated for ${identifier}`);
    
  } catch (error) {
    console.error(`API call failed for ${identifier}:`, error);
    socketMessages.value.unshift(`API call failed for ${identifier}: ${error.message}`);
  }
}

// Set up socket listeners for a specific dependency
function setupDependencyListeners(dependency) {
  console.log(`Setting up listeners for ${dependency.identifier}`);
  
  // Set up listeners for each event type
  Object.keys(dependency.events || {}).forEach(eventType => {
    const eventName = dependency.events[eventType];
    
    if (gxpStore.sockets[dependency.identifier] && gxpStore.sockets[dependency.identifier][eventType]) {
      const unsubscribe = gxpStore.sockets[dependency.identifier][eventType].listen((data) => {
        console.log(`Received ${eventType} event for ${dependency.identifier}:`, data);
        socketMessages.value.unshift(
          `${dependency.identifier}.${eventType}: ${data.message || JSON.stringify(data).substring(0, 50)}...`
        );
      });
      
      socketUnsubscribers.value.push(unsubscribe);
    }
  });
  
  socketMessages.value.unshift(`Listening for events on ${dependency.identifier}`);
}

// Example socket functionality
function handleSocketTest() {
  // Emit a test event
  gxpStore.emitSocket('primary', 'test-event', { message: 'Hello from plugin!' });
  console.log('Emitted test event via socket');
}

function emitTestEvent() {
  const timestamp = new Date().toLocaleTimeString();
  gxpStore.emitSocket('primary', 'plugin-message', { 
    message: `Test message at ${timestamp}`,
    timestamp: Date.now() 
  });
  
  socketMessages.value.unshift(`Sent: Test message at ${timestamp}`);
}

// Asset management methods
function addDevAssets() {
  // Add some development assets using the convenience method
  gxpStore.addDevAsset('main_logo', 'logo-placeholder.png');
  gxpStore.addDevAsset('background_image', 'background-placeholder.jpg');
  gxpStore.addDevAsset('product_image', 'product-placeholder.jpg');
  gxpStore.addDevAsset('avatar_placeholder', 'avatar-placeholder.png');
  
  console.log('Added development assets');
  listAllAssets();
}

function listAllAssets() {
  currentAssets.value = gxpStore.listAssets();
  console.log('Listed all assets');
}

function updateLogo() {
  // Example of updating a specific asset
  const appPort = window.location.port || 3000;
  const appProtocol = window.location.protocol || 'http';
  const newLogoUrl = `${appProtocol}://localhost:${appPort}/dev-assets/images/logo-placeholder.png`;
  gxpStore.updateAsset('main_logo', newLogoUrl);
  console.log('Updated logo asset');
  listAllAssets();
}

// Set up socket listeners when component mounts
onMounted(() => {
  // Listen for test events
  const unsubscribe1 = gxpStore.useSocketListener('primary', 'test-response', (data) => {
    console.log('Received test response:', data);
    socketMessages.value.unshift(`Received: ${JSON.stringify(data)}`);
  });
  
  // Listen for any incoming messages
  const unsubscribe2 = gxpStore.useSocketListener('primary', 'incoming-message', (data) => {
    console.log('Received incoming message:', data);
    socketMessages.value.unshift(`Incoming: ${data.message || JSON.stringify(data)}`);
  });
  
  // Store unsubscribers for cleanup
  socketUnsubscribers.value = [unsubscribe1, unsubscribe2];
  
  console.log('Plugin component mounted with GxP Datastore');
  console.log('Available store methods:', Object.keys(gxpStore));
});

// Clean up socket listeners when component unmounts
onUnmounted(() => {
  socketUnsubscribers.value.forEach(unsubscribe => {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  });
});
</script> 