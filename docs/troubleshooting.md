---
sidebar_position: 13
title: Troubleshooting & FAQ
description: Common issues and frequently asked questions for GxP development
---

# Troubleshooting & FAQ

This guide covers common issues and frequently asked questions when developing with the GxP Toolkit.

## Installation Issues

### pnpm install fails with permission errors

**Error:**
```
EACCES: permission denied
```

**Solution:**
```bash
# Option 1: Use nvm to manage Node.js (recommended)
nvm install 18
nvm use 18

# Option 2: Fix pnpm permissions
pnpm setup
# Follow the instructions to add pnpm global bin to your PATH
```

### gxdev command not found

**Error:**
```
zsh: command not found: gxdev
```

**Solutions:**

1. **Global install:**
```bash
pnpm install -g @gxp-dev/tools
```

2. **Or use pnpm dlx:**
```bash
pnpm dlx gxdev init my-plugin
```

3. **Or link locally (for toolkit development):**
```bash
cd gx-devtools
pnpm link
```

### TUI not available

**Error:**
```
TUI not available. Run "pnpm run build:tui" in gx-devtools first.
```

**Solution:**
```bash
# In the gx-devtools repository
pnpm run build:tui
```

---

## Development Server Issues

### SSL Certificate errors

**Error:**
```
NET::ERR_CERT_AUTHORITY_INVALID
```

**Solutions:**

1. **Generate certificates:**
```bash
pnpm run setup-ssl
# or
gxdev setup-ssl
```

2. **Accept certificate in browser:**
   - Click "Advanced" → "Proceed to localhost"
   - Or add certificate to system keychain

3. **Use HTTP instead:**
```bash
gxdev dev --no-https
pnpm run dev-http
```

### Port already in use

**Error:**
```
Error: Port 3060 is already in use
```

**Solutions:**

1. **Find and kill process:**
```bash
# macOS/Linux
lsof -i :3060
kill -9 <PID>

# Windows
netstat -ano | findstr :3060
taskkill /PID <PID> /F
```

2. **Use different port:**
```bash
# In .env
NODE_PORT=3061
```

### Vite HMR not working

**Symptoms:**
- Changes don't reflect without refresh
- Console shows HMR disconnect errors

**Solutions:**

1. **Check for syntax errors** in your Vue files
2. **Restart dev server:**
```bash
# In TUI
/stop vite
/dev

# Or Ctrl+C and restart
```

3. **Clear Vite cache:**
```bash
rm -rf node_modules/.vite
pnpm run dev
```

4. **Check network** - HMR needs WebSocket connection

---

## Build Issues

### Build fails with import errors

**Error:**
```
Error: Cannot find module '@/components/...'
```

**Solutions:**

1. **Check import paths** - ensure they use correct aliases:
```javascript
// Correct
import MyComponent from '@/components/MyComponent.vue';

// Wrong
import MyComponent from './src/components/MyComponent.vue';
```

2. **Verify vite.config.js** has correct aliases

3. **Check file exists** at the specified path

### CSS not included in build

**Symptoms:**
- Styles missing in production
- Components unstyled

**Solutions:**

1. **Use scoped styles:**
```vue
<style scoped>
.my-class { color: blue; }
</style>
```

2. **Import CSS in component:**
```javascript
import './MyComponent.css';
```

3. **Check for CSS import errors** in terminal

### Bundle too large

**Problem:** Build output is larger than expected

**Solutions:**

1. **Analyze bundle:**
```bash
pnpm exec vite build --mode analyze
```

2. **Check for unused dependencies**
3. **Lazy load large components:**
```javascript
const HeavyComponent = defineAsyncComponent(() =>
  import('./HeavyComponent.vue')
);
```

4. **Ensure Vue/Pinia are externalized** (they're provided by platform)

---

## App Manifest Issues

### Strings not updating from manifest

**Symptoms:**
- `gxp-string` elements show fallback values
- Changes to manifest don't reflect

**Solutions:**

1. **Check JSON syntax:**
```bash
cat app-manifest.json | python -m json.tool
```

2. **Verify key names** match between manifest and template:
```json
// manifest
"strings": {
  "default": {
    "welcome_title": "Hello"  // ← key name
  }
}
```
```html
<!-- template -->
<h1 gxp-string="welcome_title">Fallback</h1>  <!-- ← same key -->
```

3. **Check console** for manifest loading errors:
```
[GxP Store] Loaded configuration from app-manifest.json
```

4. **Ensure file location** - manifest must be in project root

### Hot reload not working for manifest

**Symptoms:**
- Must refresh page for manifest changes

**Solutions:**

1. **Check Vite HMR** is connected
2. **Look for errors** in terminal
3. **Full refresh** sometimes needed for structural changes

---

## Store Issues

### Store not reactive

**Symptoms:**
- UI doesn't update when store changes
- Computed properties don't recalculate

**Solutions:**

1. **Use store methods** for updates:
```javascript
// Correct
store.updateString('key', 'value');

// Wrong - not reactive
store.stringsList.key = 'value';
```

2. **Access via getters:**
```javascript
// Reactive
const title = computed(() => store.getString('title', 'Default'));

// Not reactive if accessed once
const title = store.getString('title', 'Default');
```

3. **Use toRefs** for destructuring:
```javascript
import { storeToRefs } from 'pinia';
const { stringsList, pluginVars } = storeToRefs(store);
```

### API calls failing

**Symptoms:**
- CORS errors
- 401 Unauthorized
- Network errors

**Solutions:**

1. **Check API environment:**
```bash
# .env
VITE_API_ENV=mock  # For local development
```

2. **Verify API key** (for non-mock environments):
```bash
VITE_API_KEY=your_key_here
```

3. **Check proxy configuration** in vite.config.js

---

## Browser Extension Issues

### Extension not loading

**Solutions:**

1. **Check extension path:**
```bash
gxdev ext:install chrome
# Shows the correct path to load
```

2. **Enable Developer Mode** in browser
3. **Check for manifest errors** in browser console
4. **Reload extension** after code changes

### Element highlighting not working

**Solutions:**

1. **Ensure you're on dev server URL** (localhost:3060)
2. **Check console** for `[GxP Inspector] Loaded` message
3. **Reload extension:**
   - Chrome: `chrome://extensions` → Refresh
   - Firefox: `about:debugging` → Reload

### Vue components not detected

**Solutions:**

1. **Ensure Vue is in dev mode**
2. **Check for Vue DevTools conflicts**
3. **Refresh page** after extension loads

---

## Socket.IO Issues

### Cannot connect to socket server

**Error:**
```
Error: Cannot connect to Socket.IO server
```

**Solutions:**

1. **Start socket server:**
```bash
gxdev dev --with-socket
# or in TUI
/socket
```

2. **Check port:**
```bash
# Default: 3069
# Verify in .env
SOCKET_IO_PORT=3069
```

3. **Match protocols** - both dev and socket servers should use same (HTTP or HTTPS)

### Events not received

**Solutions:**

1. **Check event name** is exact (case-sensitive)
2. **Verify socket server is running** (check TUI tabs)
3. **Check channel** matches dependency config
4. **Look for console errors**

### Event file not found

**Error:**
```
Event file not found: MyEvent.json
```

**Solutions:**

1. **Check file exists** in `socket-events/`
2. **Verify filename** matches event name exactly
3. **Check JSON syntax**

---

## Common FAQs

### How do I create a new project?

```bash
mkdir my-plugin
cd my-plugin
gxdev init my-plugin
pnpm run dev-http  # or pnpm run dev for HTTPS
```

### Where is the final build output?

After running `gxdev build`:
```
dist/
├── build/           # Individual build files
│   ├── plugin.es.js
│   ├── plugin.es.css
│   └── ...
└── my-plugin.gxpapp  # ← Deployable package
```

The `.gxpapp` file is a ZIP archive ready for platform upload.

### How do I add a new translatable string?

1. **Add to manifest:**
```json
{
  "strings": {
    "default": {
      "new_string_key": "Your text here"
    }
  }
}
```

2. **Use in template:**
```html
<span gxp-string="new_string_key">Default text</span>
```

Or via CLI:
```bash
gxdev datastore add --type string --key new_string_key --value "Your text"
```

### How do I customize runtime files?

```bash
# Copy to your project for customization
gxdev publish server.js
gxdev publish gxpPortalConfigStore.js
gxdev publish vite.config.js
```

### How do I test with production API?

```bash
# .env
VITE_API_ENV=production
VITE_API_KEY=your_production_key
VITE_API_PROJECT_ID=team/project
```

### How do I scan for hardcoded strings?

```bash
gxdev datastore scan-strings --component src/Plugin.vue
```

This finds text content that should use `gxp-string` directives.

### How do I generate placeholder images?

```bash
# Single placeholder
gxdev assets generate --size 400x300 --name hero

# Multiple variants
gxdev assets generate --size 200x200 --name avatar --count 5
```

Requires ImageMagick to be installed.

### How do I access Dev Tools?

Press `Ctrl+Shift+D` (or `Cmd+Shift+D` on Mac) while on the dev server page.

### Can I use TypeScript?

Yes! The toolkit supports TypeScript:

1. **Rename files** to `.ts` or `.vue` with `<script lang="ts">`
2. **Add tsconfig.json** to your project
3. **Install TypeScript** dev dependency

### How do I deploy my plugin?

1. Build: `gxdev build`
2. Upload `dist/my-plugin.gxpapp` to GxP admin portal
3. Configure settings in admin
4. Assign to kiosks

### Where do I report bugs?

File issues at: https://github.com/gramercytech/gx-devtools/issues

---

## Debug Checklist

When something isn't working, check these in order:

1. ✅ **Console errors** - Browser and terminal
2. ✅ **Network tab** - Failed requests
3. ✅ **Manifest syntax** - Valid JSON
4. ✅ **Key names** - Exact match, case-sensitive
5. ✅ **Service status** - Check TUI tabs
6. ✅ **Port conflicts** - Single instance per port
7. ✅ **File paths** - Correct aliases (@, @layouts, @gx-runtime)
8. ✅ **Cache** - Clear and restart
9. ✅ **Dependencies** - pnpm install complete
10. ✅ **Node version** - 18+ required

## Getting Help

- **Documentation**: You're reading it!
- **TUI Help**: `/help` command
- **CLI Help**: `gxdev --help` or `gxdev <command> --help`
- **Issues**: https://github.com/gramercytech/gx-devtools/issues
