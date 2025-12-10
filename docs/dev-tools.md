---
sidebar_position: 5
title: Dev Tools
description: In-browser debugging tools and browser extensions for plugin development
---

# Dev Tools

The GxP Toolkit includes powerful debugging tools to help you develop and test your plugins.

## In-Browser Dev Tools

Press `Ctrl+Shift+D` (or `Cmd+Shift+D` on Mac) to toggle the in-browser development tools.

### Features

#### Store Inspector

View and edit all store state in real-time:

- **pluginVars** - Settings from your manifest
- **stringsList** - Translatable strings
- **assetList** - Asset URLs
- **triggerState** - Runtime state

**Interactive features:**
- Hover over keys to highlight matching elements on the page
- Double-click values to edit them in real-time
- Changes are reflected immediately in your plugin

#### Layout Switcher

Toggle between different layout contexts:

- **Public** - Public-facing layout (unauthenticated users)
- **Private** - Authenticated user layout
- **System** - System/admin layout

This simulates how your plugin appears in different platform contexts.

#### Socket Simulator

Send test socket events to your plugin:

1. Select an event from the dropdown
2. Modify the JSON payload if needed
3. Click "Send" to emit the event

Your plugin receives the event as if it came from the real platform.

#### Mock Data Editor

Edit platform-provided mock data:

- **Theme colors** - Primary, secondary, background colors
- **Navigation** - Mock router state
- **Permissions** - Toggle permission flags
- **Dependencies** - Configure mock dependencies

### Console API

Access dev tools programmatically from the browser console:

```javascript
// Open/close dev tools
window.gxDevTools.open()
window.gxDevTools.close()
window.gxDevTools.toggle()

// Access the store directly
const store = window.gxDevTools.store()
console.log(store.stringsList)
store.updateState('test_value', 123)

// Change layout
window.gxDevTools.setLayout('private')
window.gxDevTools.setLayout('public')
window.gxDevTools.setLayout('system')

// Get current layout
const layout = window.gxDevTools.getLayout()
console.log(layout) // 'private'
```

## Browser Extensions

The toolkit includes browser extensions for Chrome and Firefox that provide advanced inspection capabilities.

### Installation

#### Chrome

```bash
# Launch Chrome with extension auto-loaded
gxdev dev --chrome

# Or install manually:
# 1. Go to chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select browser-extensions/chrome/
```

#### Firefox

```bash
# Launch Firefox with extension auto-loaded
gxdev dev --firefox

# Or install manually:
# 1. Go to about:debugging
# 2. Click "This Firefox"
# 3. Click "Load Temporary Add-on"
# 4. Select browser-extensions/firefox/manifest.json
```

### Extension Features

#### Element Selection

Click the selection tool in the DevTools panel, then click any element on the page to inspect it.

#### Visual Highlighting

- **Hover** - Orange dashed border shows element boundaries
- **Selected** - Cyan pulsing glow indicates the selected element

#### Smart Labels

Elements are labeled with their component context:

```
ComponentName::element::gxp-string-key
```

Examples:
- `DemoPage::h1::welcome_title`
- `CheckInForm::button::btn_submit`
- `Header::img::logo`

#### String Extraction

Identify hardcoded strings and convert them to `gxp-string` directives:

1. Select an element with hardcoded text
2. Click "Extract to gxp-string"
3. Enter a key name
4. The extension suggests the code change

#### Component Inspector

View Vue component details:

- Component name and hierarchy
- Props and their values
- Reactive data
- Computed properties

### Reloading Extensions

After modifying extension code in `browser-extensions/`:

**Chrome:**
1. Go to `chrome://extensions`
2. Find "GxP Inspector"
3. Click the refresh icon

**Firefox:**
1. Go to `about:debugging`
2. Find "GxP Inspector"
3. Click "Reload"

## CLI Dev Commands

### Datastore Commands

```bash
# List all store variables
gxdev datastore list

# Add a new variable interactively
gxdev datastore add

# Scan components for hardcoded strings
gxdev datastore scan-strings
```

The scan-strings command finds text that should be extracted to your manifest:

```bash
$ gxdev datastore scan-strings

Scanning components for hardcoded strings...

src/CheckInForm.vue:
  Line 12: "Welcome to the event"  -> Suggest: welcome_title
  Line 24: "Check In"              -> Suggest: btn_checkin

src/ErrorPage.vue:
  Line 8:  "Something went wrong"  -> Suggest: error_generic

Found 3 hardcoded strings in 2 files.
```

### Socket Commands

```bash
# List available socket events
gxdev socket list

# Send a test event
gxdev socket send --event SessionUpdated

# Send with custom data
gxdev socket send --event AttendeeCheckedIn --data '{"id": 123}'
```

### Asset Commands

```bash
# List development assets
gxdev assets list

# Initialize asset directories
gxdev assets init

# Generate placeholder images
gxdev assets generate --size 400x300 --name hero
gxdev assets generate --size 200x200 --name avatar --format png
```

## Debugging Tips

### 1. Use Vue DevTools

Install the [Vue DevTools browser extension](https://devtools.vuejs.org/) for component inspection:

- Component tree visualization
- State inspection
- Event tracking
- Performance profiling

### 2. Enable Source Maps

Source maps are enabled by default in development. Check your browser's Sources panel to debug original source files.

### 3. Console Logging

Use the store's console helpers:

```javascript
const store = useGxpStore();

// Log current state
console.log('Settings:', store.pluginVars);
console.log('Strings:', store.stringsList);
console.log('State:', store.triggerState);
```

### 4. Network Tab

Monitor API calls in your browser's Network tab. The store's API client logs requests in development mode.

### 5. Hot Reload Issues

If hot reload stops working:

1. Check the terminal for Vite errors
2. Look for syntax errors in your components
3. Try a manual page refresh
4. Restart the dev server if needed

## Troubleshooting

### Dev tools not opening

- Ensure you're on the development server (localhost:3060)
- Check browser console for JavaScript errors
- Try refreshing the page

### Extension not highlighting elements

- Reload the extension after code changes
- Check console for `[GxP Inspector] Loaded` message
- Ensure you're inspecting the correct tab

### Store changes not reflecting

- Verify your manifest syntax is valid JSON
- Check for typos in key names
- Ensure you're using the correct getter method
