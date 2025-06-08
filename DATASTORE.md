# GxP Datastore Documentation

The GxP Datastore is an optional feature for GxP projects that replaces traditional prop injection with a centralized Pinia store. This provides better development experience, easier testing, and cleaner component architecture.

## Overview

Instead of passing props like this:
```vue
<PluginPage
  :plugin-vars="pluginVars"
  :dependency-list="dependencyList"
  :asset-urls="assetList"
  :sockets="sockets"
  :strings-list="stringsList"
  :permission-flags="permissionFlags"
  :auth="auth"
  :user-session="userSession"
  :global-settings="globalSettings"
/>
```

You can now use a centralized store:
```vue
<script setup>
import { useGxpStore } from '/src/store/index.js'

const gxpStore = useGxpStore()

// Access any data directly
const primaryColor = gxpStore.getSetting('primary_color')
const welcomeText = gxpStore.getString('welcome_text')
const logo = gxpStore.getAsset('main_logo')
</script>
```

## Getting Started

### New Projects

When creating a new project, you'll be prompted to include the datastore:

```bash
npx gxto init my-project
# Choose 'y' when asked about datastore integration
```

### Existing Projects

Add datastore to an existing project:

```bash
gxto datastore init
```

This will:
- Install Pinia and axios dependencies
- Add datastore management scripts to package.json
- Create the store files in `src/store/`
- Update `main.js` to include Pinia

## CLI Commands

### List Variables
```bash
# List all store variables
gxto datastore list
# or
npm run datastore:list
```

### Add Variables
```bash
# Interactive mode
gxto datastore add

# Command-line mode
gxto datastore add --type string --key "welcome_message" --value "Hello World"
gxto datastore add --type setting --key "timeout" --value "30"
gxto datastore add --type asset --key "background" --value "/images/bg.jpg"
```

### Scan Components for Strings
```bash
# Scan a component for hardcoded strings
gxto datastore scan-strings --component src/Plugin.vue

# Interactive mode (will prompt for component path)
gxto datastore scan-strings
```

This feature automatically finds hardcoded strings in your templates and offers to add them to the store.

### Configuration Management
```bash
# List available configurations
gxto datastore config

# Switch to a specific configuration
gxto datastore config production

# Create new configurations by copying test-data.json
cp src/store/test-data.json src/store/test-data-production.json
```

## Store Structure

### Core Data Types

The store manages the same data that was previously injected as props:

#### Plugin Variables (`pluginVars`)
Configuration variables from your admin panel:
```javascript
{
  "primary_color": "#FFD600",
  "projectId": 39,
  "apiPageAuthId": "token...",
  "idle_timeout": "30",
  "background_color": "#ffffff"
}
```

#### Strings (`stringsList`)
Localized text content:
```javascript
{
  "start_line_one": "Welcome to Your App!",
  "welcome_text": "Hello World",
  "continue_button": "Continue",
  "error_message": "Something went wrong"
}
```

#### Assets (`assetList`)
Asset URLs and paths:
```javascript
{
  "main_logo": "https://example.com/logo.png",
  "background_image": "/images/bg.jpg",
  "icon_success": "/icons/success.svg"
}
```

#### Dependencies (`dependencyList`)
Platform dependency IDs:
```javascript
{
  "project_location": 4,
  "user_management": 12,
  "analytics": 8
}
```

#### Permission Flags (`permissionFlags`)
Array of permission strings:
```javascript
[
  "can_access_camera",
  "can_save_data",
  "can_share_content"
]
```

## Using the Store

### Basic Usage

```vue
<script setup>
import { useGxpStore } from '/src/store/index.js'

const gxpStore = useGxpStore()

// Get strings with fallbacks
const welcomeText = gxpStore.getString('welcome_text', 'Welcome!')

// Get settings
const primaryColor = gxpStore.getSetting('primary_color')
const projectId = gxpStore.getSetting('projectId')

// Get assets
const logo = gxpStore.getAsset('main_logo')

// Check permissions
const canSave = gxpStore.hasPermission('can_save_data')
</script>

<template>
  <div :style="{ color: primaryColor }">
    <img :src="logo" alt="Logo" />
    <h1>{{ welcomeText }}</h1>
    <button v-if="canSave" @click="saveData">Save</button>
  </div>
</template>
```

### API Calls

The store provides authenticated API methods:

```javascript
// GET request
const locations = await gxpStore.apiGet('/locations')

// POST request
const result = await gxpStore.apiPost('/save-data', { name: 'John' })

// Dependency-specific API calls
const dependencyData = await gxpStore.getDependencyData('project_location', 'locations')
await gxpStore.updateDependencyData('project_location', 'update', { lat: 40.7128, lng: -74.0060 })
```

### WebSocket Integration

The store manages WebSocket connections and provides easy event handling:

```javascript
// Emit events
gxpStore.emitSocket('primary', 'user-action', { action: 'button-click' })

// Listen for events (in component setup)
onMounted(() => {
  const unsubscribe = gxpStore.useSocketListener('primary', 'server-message', (data) => {
    console.log('Received:', data)
  })
  
  // Clean up on unmount
  onUnmounted(unsubscribe)
})
```

### Reactive Theme

The store provides a computed theme object that updates automatically:

```vue
<script setup>
const gxpStore = useGxpStore()
</script>

<template>
  <div :style="{ 
    backgroundColor: gxpStore.theme.background_color,
    color: gxpStore.theme.text_color 
  }">
    Content styled with store theme
  </div>
</template>
```

## Development vs Production

### Development Mode
- Uses test data from `src/store/test-data.json`
- WebSocket connects to localhost:3069 (can be set in .env file)
- API calls use configured base URL with test token

### Production Mode
When deployed to the platform:
- Test data is replaced with real platform-injected data
- The same store interface works seamlessly
- Pinia store becomes an external dependency
- Platform provides the configured store instance

## File Structure

When datastore is enabled, your project will have:

```
src/
├── store/
│   ├── index.js           # Pinia setup & store imports
│   ├── test-data.json     # Test configuration
│   └── test-data-*.json   # Additional configurations
├── Plugin.vue             # Your component (uses store)
└── ...
main.js                    # Includes Pinia setup
App.vue                    # No prop drilling needed

# Note: gxp-store.js is kept in the package by default
# Run 'gxto publish gxp-store.js' to create a local copy for customization
```

## Migration Guide

### From Props to Store

**Before (with props):**
```vue
<script setup>
const props = defineProps({
  pluginVars: Object,
  stringsList: Object,
  assetList: Object,
  // ... more props
})

const primaryColor = props.pluginVars.primary_color
const welcomeText = props.stringsList.welcome_text
</script>
```

**After (with store):**
```vue
<script setup>
import { useGxpStore } from '/src/store/index.js'

const gxpStore = useGxpStore()

const primaryColor = gxpStore.getSetting('primary_color')
const welcomeText = gxpStore.getString('welcome_text')
</script>
```

### Socket Migration

**Before:**
```vue
<script setup>
const props = defineProps({ sockets: Object })

props.sockets.primary.broadcast('event', data)
props.sockets.primary.listen('response', callback)
</script>
```

**After:**
```vue
<script setup>
import { useGxpStore } from '/src/store/index.js'

const gxpStore = useGxpStore()

gxpStore.emitSocket('primary', 'event', data)
gxpStore.useSocketListener('primary', 'response', callback)
</script>
```

## Best Practices

1. **Always provide fallbacks** when getting strings:
   ```javascript
   gxpStore.getString('button_text', 'Default Text')
   ```

2. **Use semantic variable names** in test data:
   ```json
   {
     "welcome_heading": "Welcome!",
     "submit_button_text": "Submit Form",
     "error_network_message": "Network error occurred"
   }
   ```

3. **Organize test configurations** by environment:
   ```bash
   src/store/test-data.json           # Default
   src/store/test-data-staging.json   # Staging environment
   src/store/test-data-demo.json      # Demo configuration
   ```

4. **Clean up socket listeners** in components:
   ```javascript
   onUnmounted(() => {
     socketUnsubscribers.forEach(unsubscribe => unsubscribe())
   })
   ```

5. **Use TypeScript** for better development experience:
   ```typescript
   const gxpStore = useGxpStore()
   // Store methods are fully typed
   ```

## Troubleshooting

### Common Issues

1. **Store not found error**
   - Ensure you've run `gxto datastore init` or created project with datastore
   - Check that `src/store/` directory exists

2. **Pinia not registered error**
   - Verify `main.js` includes `app.use(pinia)`
   - Ensure Pinia is installed: `npm install pinia`

3. **API calls failing**
   - Check `apiBaseUrl` and `apiPageAuthId` in test data
   - Verify network connectivity in development

4. **Socket events not working**
   - Ensure socket server is running on localhost:3069
   - Check browser developer tools for WebSocket connection errors

### Getting Help

- Check the console for detailed error messages
- Use `gxto datastore list` to verify your data structure
- Review the generated example code in `src/Plugin.vue`

## Advanced Usage

### Custom Store Extensions

You can extend the store for specific functionality:

```javascript
// In your component
const gxpStore = useGxpStore()

// Custom computed values
const isDesktopView = computed(() => 
  gxpStore.getSetting('view_mode') === 'desktop'
)

// Custom methods
async function handleCustomWorkflow() {
  const step1 = await gxpStore.getDependencyData('workflow', 'step1')
  const step2 = await gxpStore.apiPost('/process', step1)
  gxpStore.emitSocket('primary', 'workflow-complete', step2)
}
```

### Dynamic Configuration

Switch between configurations at runtime:

```javascript
// Copy configurations and switch between them
gxpStore.loadConfiguration('production')  // Coming in future versions
```

This datastore feature significantly improves the development experience while maintaining full compatibility with the platform's injection system in production. 