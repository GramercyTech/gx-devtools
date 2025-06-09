# GxP Project with GX ComponentKit

This project was created with `@gramercytech/gx-toolkit` and includes the `@gramercytech/gx-componentkit` component library for rapid kiosk development.

## Quick Start

1. **Start development server:**
   ```bash
   npm run dev
   ```

2. **Build for production:**
   ```bash
   npm run build
   ```

## Project Architecture

This project follows a specific architecture designed for the GxP platform:

### App.vue - Platform Container
The `App.vue` file is the **standard platform container** provided by the GxP platform. It:
- Initializes the store and manages platform-level state
- Provides the basic app flow (Start → Plugin → Final)
- Handles navigation between core platform pages
- Injects props and configuration into your custom Plugin component
- **Should NOT be modified** - it remains consistent across all projects

### Plugin.vue - Your App Entry Point
The `Plugin.vue` file is the **root component of your actual app**. It:
- Serves as the entry point for your custom application
- Receives props from the platform container (App.vue during development)
- Can import and use hundreds of custom components, utilities, and dependencies
- Acts as the starting point - everything imported into it (directly or indirectly) gets compiled
- Where you implement your unique kiosk experience structure

## Project Structure

```
├── App.vue              # Platform container (development mimics production)
├── main.js              # Development entry point (mimics platform)
├── server.js            # Development server (mimics platform)
├── src/
│   ├── Plugin.vue       # Your app root component (production entry point)
│   ├── components/      # Your custom components
│   ├── composables/     # Your custom logic
│   ├── utils/           # Your utilities
│   └── ...              # Any other app structure you need
└── index.html           # HTML template (development only)
```

## Development Workflow

1. **Start with Plugin.vue** - This is your app's root component
2. **Build your app structure** - Create components, composables, utils as needed
3. **Import everything into Plugin.vue** - Either directly or through component trees
4. **Use the provided props** - Access configuration via props passed from platform
5. **Use router for navigation** - Navigate between platform pages using the router prop
6. **Test locally** - Development environment mimics the production platform
7. **Deploy** - Your entire app tree (starting from Plugin.vue) gets compiled

## Compilation & Deployment

When your app is compiled and deployed to the GxP platform:

- **Development files are excluded** - App.vue, main.js, server.js are just dev tools
- **Plugin.vue becomes your app root** - It's the entry point for compilation
- **All imports are included** - Components, composables, utils imported from Plugin.vue tree
- **Props are injected automatically** - The platform passes all configuration
- **Navigation uses router prop** - Navigate between platform pages using Inertia.js-style visits

**Example app structure:**
```
Plugin.vue (root)
├── imports MyHeader.vue
├── imports MyContent.vue
│   ├── imports ProductList.vue
│   ├── imports ShoppingCart.vue
│   └── imports MyModal.vue
└── imports MyFooter.vue
```

All of these components and their dependencies get compiled into your final app, starting from Plugin.vue as the root.

## Building Complex Apps

You can build sophisticated applications with any structure you need:

### Component Organization
```
src/
├── Plugin.vue                 # Your app root
├── components/
│   ├── layout/
│   │   ├── Header.vue
│   │   ├── Sidebar.vue
│   │   └── Footer.vue
│   ├── ui/
│   │   ├── Button.vue
│   │   ├── Modal.vue
│   │   └── Card.vue
│   └── features/
│       ├── ProductCatalog.vue
│       ├── ShoppingCart.vue
│       └── UserProfile.vue
├── composables/
│   ├── useApi.js
│   ├── useAuth.js
│   └── useCart.js
├── utils/
│   ├── helpers.js
│   ├── validators.js
│   └── constants.js
└── stores/
    ├── products.js
    └── user.js
```

### In Plugin.vue
```vue
<script setup>
// Import whatever you need
import Header from './components/layout/Header.vue'
import ProductCatalog from './components/features/ProductCatalog.vue'
import { useApi } from './composables/useApi.js'
import { formatPrice } from './utils/helpers.js'

// Your app logic here
</script>
```

As long as your components and utilities are imported (directly or indirectly) into Plugin.vue, they'll be included in the final compilation.

## GX ComponentKit Integration

This project includes the `@gramercytech/gx-componentkit` component library, which provides:

### Page Components
- `GxPageStart` - Welcome/start screen with idle timeout
- `GxPageInstructions` - Instruction display page
- `GxPageCamera` - Camera capture interface
- `GxPageResults` - Results display page
- `GxPageShare` - Social sharing interface
- `GxPageFinal` - Thank you/completion page
- `GxPageLoading` - Loading overlay

### UI Components
- `GxModal` - Customizable modal dialogs
- `GxCountdown` - Timer/countdown component
- `GxVideoPlayer` - Video player with custom controls
- `GxThemeWrapper` - Theme provider component

### Composables
- `useMedia()` - Camera, video, and audio utilities
- `useAnimations()` - Animation helpers
- `useScanning()` - Barcode/QR scanning
- `useErrors()` - Error state management

## Plugin.vue Development

Your `Plugin.vue` component receives the following props from the platform:

> **Note:** For a complete example of a multi-page kiosk workflow (with camera, results, sharing, etc.), see `AdvancedExample.vue` in this directory. This shows how to build complex workflows within your Plugin.vue component.

```javascript
// Props available in Plugin.vue
const props = defineProps({
    pluginVars: Object,        // Custom variables from admin panel
    dependencyList: Object,    // Selected dependencies
    assetUrls: Object,         // Asset URLs (signed URLs for images, etc.)
    stringsList: Object,       // Localized strings
    permissionFlags: Array,    // Permission flags
    theme: Object,            // Theme configuration
    router: Object            // Platform router for navigation (Inertia.js-based)
});
```

### Basic Plugin Structure

```vue
<template>
    <GxThemeWrapper :theme="theme" class="plugin-container">
        <!-- Your custom content here -->
        <h1>{{ stringsList?.welcome_text || 'Welcome!' }}</h1>
        
        <!-- Platform Navigation -->
        <button @click="router.visit('/start')">← Back to Start</button>
        <button @click="router.visit('/final')">Complete Experience →</button>
        
        <!-- Or navigate to other platform pages -->
        <button @click="router.visit('/share', { method: 'post', data: shareData })">
            Share Results
        </button>
    </GxThemeWrapper>
</template>

<script setup>
import { GxThemeWrapper } from '@gramercytech/gx-componentkit';

// Define props (injected by platform)
const props = defineProps({
    pluginVars: Object,
    dependencyList: Object,
    assetUrls: Object,
    stringsList: Object,
    permissionFlags: Array,
    theme: Object,
    router: Object        // Platform router for navigation
});

// Use router for navigation instead of emits
const navigateToFinal = () => {
    router.visit('/final');
};
</script>
```

## Configuration

All configuration is handled through the platform and injected into your Plugin.vue component:

### Plugin Variables
Access your custom variables via the `pluginVars` prop:

```javascript
// In Plugin.vue
const { pluginVars } = props;
console.log(pluginVars.primary_color); // "#FFD600"
console.log(pluginVars.projectId);     // 39
```

### Assets
Access your assets via the `assetUrls` prop:

```javascript
// In Plugin.vue template
<img :src="assetUrls.main_logo" alt="Logo" />
<img :src="assetUrls.background_image" alt="Background" />
```

### Strings
Access localized strings via the `stringsList` prop:

```javascript
// In Plugin.vue template
<h1>{{ stringsList.welcome_text }}</h1>
<p>{{ stringsList.instruction_text }}</p>
```

### Theme
Access theme configuration via the `theme` prop:

```javascript
// In Plugin.vue - theme is automatically applied via GxThemeWrapper
<GxThemeWrapper :theme="theme">
    <!-- Your content inherits theme variables -->
</GxThemeWrapper>
```

## Development Tips

### Using GX ComponentKit Components
Import and use components in your Plugin.vue:

```vue
<script setup>
import { 
    GxModal, 
    GxCountdown, 
    GxVideoPlayer,
    useMedia 
} from '@gramercytech/gx-componentkit';

const { startCamera, takePhoto } = useMedia();
</script>

<template>
    <GxCountdown :duration="30" @finished="handleFinished" />
    <GxVideoPlayer :src="videoUrl" @play="handlePlay" />
</template>
```

### Custom Styling
Theme variables are automatically available:

```css
/* In Plugin.vue styles */
.my-component {
    background: var(--gx-primary-color);
    color: var(--gx-text-color);
    border: 2px solid var(--gx-primary-color);
}
```

### Navigation
Use the router prop to navigate between platform pages (based on [Inertia.js manual visits](https://inertiajs.com/manual-visits)):

```vue
<script setup>
// Access router from props
const { router } = props;

// Navigate to different platform pages
const goToStart = () => router.visit('/start');
const goToFinal = () => router.visit('/final');
const goToCamera = () => router.visit('/camera');
const goToShare = (data) => router.visit('/share', { 
    method: 'post', 
    data: data 
});

// Navigate with options
const navigateWithLoader = () => {
    router.visit('/results', {
        preserveScroll: true,
        preserveState: true,
        onStart: () => console.log('Navigation started'),
        onFinish: () => console.log('Navigation completed')
    });
};
</script>

<template>
    <button @click="goToStart">← Back to Start</button>
    <button @click="goToFinal">Complete Experience →</button>
    <button @click="goToCamera">Take Photo</button>
    <button @click="goToShare({ image: photoData })">Share Results</button>
</template>
```

## Platform Router

The platform provides a router prop that follows the [Inertia.js manual visits](https://inertiajs.com/manual-visits) pattern for seamless navigation:

### Available Routes
- `/start` - Welcome/start screen
- `/instructions` - Instruction display
- `/camera` - Camera capture interface  
- `/results` - Results display
- `/share` - Social sharing interface
- `/final` - Thank you/completion page

### Router Methods
```javascript
// Basic navigation
router.visit('/camera');

// POST data to a route
router.visit('/share', {
    method: 'post',
    data: { image: photoUrl, caption: 'My photo!' }
});

// Navigation with options
router.visit('/results', {
    preserveScroll: true,    // Maintain scroll position
    preserveState: true,     // Keep component state
    replace: true,           // Replace history entry
    onStart: () => {},       // Called before navigation
    onFinish: () => {},      // Called after navigation
    onError: (errors) => {}  // Handle navigation errors
});
```

### Example Usage in Plugin
```vue
<script setup>
const { router, pluginVars } = props;

const handlePhotoTaken = async (photoData) => {
    // Process photo...
    const processedData = await processPhoto(photoData);
    
    // Navigate to results with data
    router.visit('/results', {
        method: 'post',
        data: { photo: processedData }
    });
};

const shareExperience = () => {
    router.visit('/share', {
        method: 'post',
        data: {
            image: currentPhoto.value,
            title: 'Check out my experience!',
            hashtags: ['#awesome', '#kiosk']
        }
    });
};
</script>
```

## Scripts

- `npm run dev` - Start HTTPS development server with Socket.IO
- `npm run dev-app` - Start HTTPS development server only
- `npm run dev-http` - Start HTTP development server  
- `npm run build` - Build for production
- `npm run setup-ssl` - Generate SSL certificates
- `npm run socket:list` - List available socket events
- `npm run socket:send` - Send test socket events
- `npm run assets:list` - List development assets
- `npm run assets:init` - Initialize asset directories
- `npm run assets:generate` - Generate placeholder images
- `npm run placeholder` - Generate custom placeholder

## Asset Management

The toolkit provides a complete asset management system for development with placeholder generation:

### Available Commands
```bash
# List all development assets
npm run assets:list
gxto assets list

# Initialize asset directories and copy starter assets
npm run assets:init
gxto assets init

# Generate placeholder images (requires ImageMagick)
npm run assets:generate
gxto assets generate --size 800x600 --name product-image

# Generate custom placeholder with specific color and text
gxto assets generate --name logo --size 200x200 --color "#FF5722" --text "My Logo"

# Generate different formats
gxto assets generate --name banner --size 1200x400 --format jpg
```

### ImageMagick Installation
Asset generation requires ImageMagick to be installed:

```bash
# macOS
brew install imagemagick

# Ubuntu/Debian
sudo apt-get install imagemagick

# Windows
# Download from https://imagemagick.org/script/download.php#windows
```

### Asset Structure
```
dev-assets/
├── images/          # Generated and custom images
│   ├── logo-placeholder.png
│   ├── background-placeholder.jpg
│   └── custom-images...
└── videos/          # Video assets (manual upload)
```

### Using Assets in Your Store
```javascript
// Add assets to your GxP store (if using datastore)
gxpStore.updateAsset("main_logo", "/dev-assets/images/logo-placeholder.png");

// Access in components
const logoUrl = gxpStore.getAsset("main_logo");

// Or use directly in templates
const assetList = {
    "main_logo": "/dev-assets/images/logo-placeholder.png",
    "background_image": "/dev-assets/images/background-placeholder.jpg"
};
```

## Socket Simulation

The toolkit includes socket simulation for testing real-time features:

```bash
# List all available socket events
npm run socket:list

# Send a specific socket event
npm run socket:send

# Send to specific identifier/channel
gxto socket send --event SocialStreamPostCreated --identifier "stream_123"
```

## Learn More

- [GX ComponentKit Documentation](https://github.com/gramercytech/gx-componentkit)
- [GxP Platform Documentation](https://www.gramercytech.com/gxp)
- [Vue 3 Documentation](https://vuejs.org/)

## Support

For questions about this template or gx-componentkit integration, please contact the development team or check the documentation links above. 