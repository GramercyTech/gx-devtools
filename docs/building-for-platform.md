---
sidebar_position: 6
title: Building for Platform
description: Prepare your plugin for production deployment on the GxP platform
---

# Building for Platform

This guide covers how to build and prepare your plugin for deployment to the GxP platform.

## Build Command

Run the build command to create a production-ready bundle:

```bash
gxtk build
# or
npm run build
```

This creates a `dist/` folder with optimized assets:

```
dist/
├── assets/
│   ├── Plugin-[hash].js      # Main plugin bundle
│   ├── Plugin-[hash].css     # Extracted styles
│   └── [other chunks]        # Code-split chunks
├── index.html                # (dev only, not deployed)
└── manifest.json             # Build manifest
```

## What Gets Built

The build process:

1. **Compiles Vue SFCs** - Single File Components are compiled to JavaScript
2. **Bundles dependencies** - Tree-shakes and bundles only what you use
3. **Extracts CSS** - Styles are extracted to separate files
4. **Minifies code** - JavaScript and CSS are minified
5. **Generates hashes** - File names include content hashes for caching
6. **Creates source maps** - Optional source maps for debugging

## Build Configuration

### vite.config.js

Your project's `vite.config.js` controls the build:

```javascript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@layouts': path.resolve(__dirname, './theme-layouts'),
      '@gx-runtime': path.resolve(__dirname, './node_modules/@gramercytech/gx-toolkit/runtime'),
    },
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/Plugin.vue'),
      name: 'GxpPlugin',
      fileName: (format) => `plugin.${format}.js`,
    },
    rollupOptions: {
      external: ['vue', 'pinia'],
      output: {
        globals: {
          vue: 'Vue',
          pinia: 'Pinia',
        },
      },
    },
  },
});
```

### Environment Variables

Production builds use `.env.production` if present:

```bash
# .env.production
VITE_API_URL=https://api.gramercy.cloud
VITE_ENVIRONMENT=production
```

Access in code:

```javascript
const apiUrl = import.meta.env.VITE_API_URL;
```

## Pre-Build Checklist

Before building for production:

### 1. Remove Development Code

```javascript
// Remove or wrap in dev checks
if (import.meta.env.DEV) {
  console.log('Debug info:', data);
}
```

### 2. Verify All Strings Are Extracted

Run the string scanner to find hardcoded text:

```bash
gxtk datastore scan-strings
```

Ensure all user-facing text uses `gxp-string` directives.

### 3. Check Asset References

Verify all assets use `gxp-src` directives:

```html
<!-- Good -->
<img gxp-src="hero_image" src="/dev-assets/placeholder.jpg" />

<!-- Bad - hardcoded URL won't work in production -->
<img src="/dev-assets/images/hero.jpg" />
```

### 4. Test All Layouts

Test your plugin in all layout contexts:

- Public layout
- Private layout
- System layout

Use the Dev Tools layout switcher or:

```javascript
window.gxDevTools.setLayout('public');
window.gxDevTools.setLayout('private');
window.gxDevTools.setLayout('system');
```

### 5. Validate Manifest

Ensure your `app-manifest.json` is complete:

```bash
# Check for JSON syntax errors
cat app-manifest.json | python -m json.tool
```

## Production Considerations

### Performance

- **Lazy load routes** - Use dynamic imports for large components
- **Optimize images** - Use appropriate sizes and formats
- **Minimize dependencies** - Only import what you need

```javascript
// Lazy load heavy components
const HeavyChart = defineAsyncComponent(() =>
  import('./components/HeavyChart.vue')
);
```

### Error Handling

Add proper error boundaries:

```vue
<template>
  <div v-if="error" class="error-state">
    <p gxp-string="error_generic">Something went wrong</p>
    <button @click="retry">Retry</button>
  </div>
  <div v-else>
    <!-- Normal content -->
  </div>
</template>
```

### Offline Support

Consider what happens when the network is unavailable:

```javascript
const store = useGxpStore();

try {
  const data = await store.apiGet('/endpoint');
} catch (error) {
  if (!navigator.onLine) {
    store.updateState('offline_mode', true);
  }
}
```

### Accessibility

Ensure your plugin is accessible:

- Use semantic HTML elements
- Add ARIA labels where needed
- Support keyboard navigation
- Test with screen readers

```html
<button
  gxp-string="btn_checkin"
  aria-label="Check in to the event"
  @keydown.enter="handleCheckin"
>
  Check In
</button>
```

## Deployment

### Upload to Platform

After building, upload your plugin to the GxP platform:

1. Log in to the GxP admin portal
2. Navigate to Plugins > Upload
3. Select your `dist/` folder contents
4. Configure plugin settings
5. Assign to kiosks

### Version Management

Track your plugin versions:

```json
// package.json
{
  "name": "my-plugin",
  "version": "1.2.0"
}
```

Use semantic versioning:
- **MAJOR** - Breaking changes
- **MINOR** - New features (backward compatible)
- **PATCH** - Bug fixes

### Testing in Production

Use the browser extensions to test your plugin on production kiosks:

```bash
# Build extensions for distribution
gxtk ext:build
```

This creates installable extension packages for Chrome and Firefox.

## Troubleshooting Builds

### Build Fails with Import Errors

Check that all imports use the correct aliases:

```javascript
// Correct
import { useGxpStore } from '@gx-runtime/stores/gxpPortalConfigStore';

// Wrong - path won't resolve in production
import { useGxpStore } from '../../node_modules/@gramercytech/gx-toolkit/runtime/stores/gxpPortalConfigStore';
```

### CSS Not Loading

Ensure styles are properly scoped or imported:

```vue
<style scoped>
/* Scoped styles are extracted correctly */
.my-component {
  color: blue;
}
</style>
```

### Bundle Too Large

Analyze your bundle:

```bash
# Add to package.json scripts
"analyze": "vite build --mode analyze"
```

Check for:
- Unused dependencies
- Large libraries that could be lazy-loaded
- Duplicate code

### Assets Not Found

Production assets come from the platform. Ensure you're using directives:

```html
<!-- Platform provides the actual URL -->
<img gxp-src="logo" src="/placeholder.jpg" />
```

The `src` attribute is only used during development as a fallback.
