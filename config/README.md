# GxP Project with GX UIKit

This project was created with `@gramercytech/gx-toolkit` and includes the `@gramercytech/gx-componentkit` component library for rapid kiosk development.

## Quick Start

1. **Configure your environment:**
   ```bash
   cp .env.example .env
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Build for production:**
   ```bash
   npm run build
   ```

## Project Structure

```
├── App.vue              # Main app with basic gx-componentkit integration
├── KioskApp.vue         # Advanced kiosk template (full workflow)
├── src/
│   └── Plugin.vue       # Your custom plugin component
├── main.js              # App entry point with gx-componentkit setup
├── server.js            # Development server
└── index.html           # HTML template
```

## GX UIKit Integration

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

## Templates

### Basic Template (App.vue)
The default `App.vue` provides a simple 3-page flow:
- Start page → Plugin page → Final page
- Includes loading states and basic navigation
- Good for simple plugins or custom experiences

### Advanced Template (KioskApp.vue)
The `KioskApp.vue` template provides a complete kiosk workflow:
- Start → Instructions → Camera → Results → Share → Final
- Full error handling and state management
- Demonstrates all major gx-componentkit components
- Perfect for photo kiosks, interactive experiences

To use the advanced template, replace the import in `main.js`:
```javascript
// Change this:
import App from './App.vue'

// To this:
import App from './KioskApp.vue'
```

## Configuration

### Theme Configuration
Customize your app's appearance by modifying the `theme` object:

```javascript
const theme = {
    background_color: "#ffffff",
    text_color: "#333333",
    primary_color: "#FFD600",
    start_background_color: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    start_text_color: "#ffffff",
    // ... more theme options
};
```

### Plugin Variables
Configure your plugin through the `pluginVars` object:

```javascript
const pluginVars = {
    "primary_color": "#FFD600",
    "projectId": 39,
    "apiBaseUrl": "https://api.efcloud.app",
    "idle_timeout": "30",
    // ... your custom variables
};
```

### Strings Configuration
Customize all text through the `stringsList` object:

```javascript
const stringsList = {
    "start_line_one": "Welcome to Your App!",
    "start_line_two": "Touch to begin your experience",
    // ... all customizable strings
};
```

### Assets Configuration
Reference your assets through the `assetList` object:

```javascript
const assetList = {
    "main_logo": "path/to/your/logo.png",
    "background_image": "path/to/background.jpg",
    // ... your assets
};
```

## Development Tips

### Using Components
Import and use gx-componentkit components in your custom components:

```vue
<script setup>
import { GxModal, GxCountdown, useMedia } from '@gramercytech/gx-componentkit';

const { startCamera, takePhoto } = useMedia();
</script>

<template>
    <GxCountdown :duration="30" @finished="handleFinished" />
</template>
```

### Custom Styling
All components support theming through CSS custom properties:

```css
:root {
    --gx-primary-color: #your-color;
    --gx-background-color: #your-bg;
    --gx-text-color: #your-text;
}
```

### Event Handling
Components emit events for navigation and interaction:

```vue
<GxPageStart 
    @start="goToNextPage"
    @idle-timeout="resetApp"
/>
```

## Scripts

- `npm run dev` - Start HTTPS development server
- `npm run dev-http` - Start HTTP development server  
- `npm run build` - Build for production
- `npm run dev-socket` - Start with socket.io server
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
gxpStore.updateAsset("main_logo", "http://localhost:3069/dev-assets/images/logo-placeholder.png");

// Access in components
const logoUrl = gxpStore.getAsset("main_logo");

// Or use directly in templates
const assetList = {
    "main_logo": "http://localhost:3069/dev-assets/images/logo-placeholder.png",
    "background_image": "http://localhost:3069/dev-assets/images/background-placeholder.jpg"
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

- [GX UIKit Documentation](https://github.com/gramercytech/gx-componentkit)
- [GxP Platform Documentation](https://docs.eventfinity.co)
- [Vue 3 Documentation](https://vuejs.org/)

## Support

For questions about this template or gx-componentkit integration, please contact the development team or check the documentation links above. 