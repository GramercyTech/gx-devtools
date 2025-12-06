# GxP Plugin Project

This project was created with `@gramercytech/gx-toolkit` and includes the `@gramercytech/gx-componentkit` component library for rapid kiosk development.

## Quick Start

```bash
# Start HTTP development server
npm run dev-http

# Start HTTPS development server with Socket.IO
npm run dev

# Build for production
npm run build
```

## Project Structure

```
your-project/
├── src/
│   ├── Plugin.vue           # Your app entry point (customize this!)
│   ├── DemoPage.vue         # Example component
│   ├── components/          # Your custom components
│   ├── composables/         # Your custom logic
│   ├── stores/              # Pinia stores
│   │   └── index.js         # Store setup
│   └── socket-events/       # Socket event templates
├── theme-layouts/           # Layout templates (System, Private, Public)
│   ├── SystemLayout.vue
│   ├── PrivateLayout.vue
│   ├── PublicLayout.vue
│   └── AdditionalStyling.css
├── dev-assets/              # Development placeholder images
├── socket-events/           # Socket event JSON files for simulation
├── main.js                  # Development entry point
├── vite.config.js           # Vite build configuration
├── app-manifest.json        # Plugin manifest
├── index.html               # Development HTML template
└── .env                     # Environment configuration
```

## How It Works

### Plugin.vue - Your App Entry Point

`src/Plugin.vue` is the root component of your application. During development, it's wrapped by the toolkit's PortalContainer (which emulates the GxP platform). In production, the platform loads your Plugin.vue directly.

```vue
<template>
  <div class="my-plugin">
    <h1>{{ stringsList?.welcome_text || 'Welcome!' }}</h1>
    <!-- Your custom content here -->
  </div>
</template>

<script setup>
// Props injected by the platform
const props = defineProps({
  pluginVars: Object,      // Custom variables from admin panel
  dependencyList: Object,  // Selected dependencies
  assetUrls: Object,       // Asset URLs (signed URLs for images, etc.)
  stringsList: Object,     // Localized strings
  permissionFlags: Array,  // Permission flags
  theme: Object,           // Theme configuration
  router: Object           // Platform router for navigation
});
</script>
```

### Theme Layouts

The `theme-layouts/` directory contains layout templates that wrap your Plugin component. The platform uses these to provide consistent UI structure:

- **SystemLayout.vue** - System-level pages (errors, maintenance)
- **PrivateLayout.vue** - Authenticated user pages
- **PublicLayout.vue** - Public-facing pages

You can customize these layouts to match your kiosk's design.

## Development

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start HTTPS dev server with Socket.IO |
| `npm run dev-app` | Start HTTPS dev server only |
| `npm run dev-http` | Start HTTP dev server (no SSL) |
| `npm run build` | Build for production |
| `npm run setup-ssl` | Generate SSL certificates |
| `npm run socket:list` | List available socket events |
| `npm run socket:send` | Send test socket events |
| `npm run assets:list` | List development assets |
| `npm run assets:init` | Initialize asset directories |
| `npm run assets:generate` | Generate placeholder images |

### Dev Tools Modal

During development, press **Ctrl+Shift+D** (or **Cmd+Shift+D** on Mac) to open the Dev Tools Modal. You can also click the gear icon in the bottom-right corner.

The Dev Tools Modal provides:

1. **Store Inspector** - View and edit store state:
   - `pluginVars` - Custom variables
   - `stringsList` - Localized strings
   - `assetList` - Asset URLs
   - `triggerState` - Trigger states
   - `dependencyList` - Dependencies

2. **Layout Switcher** - Toggle between System, Private, and Public layouts

3. **Socket Simulator** - Send test socket events to your app

4. **Mock Data Editor** - Edit theme colors, navigation items, user session, and permissions

You can also control dev tools from the browser console:
```javascript
window.gxDevTools.open()   // Open modal
window.gxDevTools.close()  // Close modal
window.gxDevTools.toggle() // Toggle modal
```

### Environment Variables

Configure your development environment in `.env`:

```bash
# Development server port
VITE_DEV_PORT=3060

# Socket.IO server port
VITE_SOCKET_PORT=3069

# SSL certificates (if using HTTPS)
VITE_SSL_CERT=.certs/localhost.pem
VITE_SSL_KEY=.certs/localhost-key.pem
```

## Platform Props

Your Plugin.vue component receives these props from the platform:

### pluginVars
Custom variables configured in the admin panel:
```javascript
const { pluginVars } = props;
console.log(pluginVars.primary_color);  // "#FFD600"
console.log(pluginVars.projectId);       // 39
```

### assetUrls
URLs for configured assets:
```vue
<img :src="assetUrls.main_logo" alt="Logo" />
<img :src="assetUrls.background_image" alt="Background" />
```

### stringsList
Localized strings:
```vue
<h1>{{ stringsList.welcome_text }}</h1>
<p>{{ stringsList.instruction_text }}</p>
```

### theme
Theme configuration (colors, fonts, etc.):
```vue
<GxThemeWrapper :theme="theme">
  <!-- Your content inherits theme variables -->
</GxThemeWrapper>
```

### router
Platform router for navigation (Inertia.js-style):
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
  preserveScroll: true,
  preserveState: true,
  replace: true,
  onStart: () => {},
  onFinish: () => {},
  onError: (errors) => {}
});
```

## GX ComponentKit

This project includes `@gramercytech/gx-componentkit` with pre-built components:

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

### Usage Example
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

## Custom Styling

Theme CSS variables are automatically available:

```css
.my-component {
  background: var(--gx-primary-color);
  color: var(--gx-text-color);
  border: 2px solid var(--gx-primary-color);
}
```

## Socket Events

Test real-time features with socket simulation:

```bash
# List available socket events
npm run socket:list

# Send a socket event
npm run socket:send

# Send to specific channel
gxtk socket send --event SocialStreamPostCreated --identifier "stream_123"
```

Socket event templates are in `socket-events/` directory. Add your own JSON files to simulate custom events.

## Asset Management

```bash
# List all development assets
npm run assets:list

# Initialize asset directories
npm run assets:init

# Generate placeholder images (requires ImageMagick)
npm run assets:generate
gxtk assets generate --size 800x600 --name product-image
gxtk assets generate --name logo --size 200x200 --color "#FF5722" --text "My Logo"
```

### ImageMagick Installation
```bash
# macOS
brew install imagemagick

# Ubuntu/Debian
sudo apt-get install imagemagick

# Windows - download from https://imagemagick.org/script/download.php
```

## Building for Production

```bash
npm run build
```

This creates a `dist/` folder with:
- `plugin.es.js` - Your compiled plugin (ES module)
- `style.css` - Compiled styles

The build excludes development files (main.js, index.html) and externalizes Vue (the platform provides it).

## Project Architecture

```
Plugin.vue (your entry point)
├── imports YourHeader.vue
├── imports YourContent.vue
│   ├── imports ProductList.vue
│   ├── imports ShoppingCart.vue
│   └── imports YourModal.vue
└── imports YourFooter.vue
```

Everything imported into Plugin.vue (directly or indirectly) is included in the build. The platform loads your Plugin.vue and injects the necessary props.

## Learn More

- [GX ComponentKit Documentation](https://github.com/gramercytech/gx-componentkit)
- [GxP Platform Documentation](https://www.gramercytech.com/gxp)
- [Vue 3 Documentation](https://vuejs.org/)
- [Vite Documentation](https://vitejs.dev/)

## Support

For questions about this template or gx-componentkit integration, please contact the development team or check the documentation links above.
