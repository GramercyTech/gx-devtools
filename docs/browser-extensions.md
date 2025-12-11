---
sidebar_position: 8
title: Browser Extensions
description: GxP Inspector browser extensions for Chrome and Firefox development
---

# Browser Extensions

The GxP Toolkit includes browser extensions for Chrome and Firefox that provide advanced development and debugging capabilities for your plugins.

## Overview

The GxP Inspector extension adds a DevTools panel that allows you to:

- **Inspect Vue components** and their props/data
- **Select elements** on the page to view their GxP attributes
- **Highlight elements** with visual feedback during selection
- **Extract hardcoded strings** and convert them to gxp-string directives
- **View component hierarchy** and GxP integration

## Quick Start

### Launch with Development Server

The easiest way to use the extensions is to launch them with the dev server:

```bash
# Chrome
gxdev dev --chrome

# Firefox
gxdev dev --firefox

# Both
gxdev dev --chrome --firefox
```

This automatically:
1. Starts the Vite development server
2. Launches the browser with the extension loaded
3. Navigates to your dev server URL

### Launch Extension Only

If the dev server is already running:

```bash
# Chrome
gxdev ext:chrome

# Firefox
gxdev ext:firefox
```

## Installation Methods

### Temporary Installation (Development)

Extensions are loaded temporarily when launched via `gxdev`. They persist until the browser closes.

### Permanent Installation

For persistent access during development:

#### Chrome

```bash
gxdev ext:install chrome
```

Then follow the instructions:

1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the extension directory shown in the terminal

The extension will persist across browser restarts. After code changes, click the refresh icon on the extension card.

#### Firefox

```bash
gxdev ext:install firefox
```

**Option 1: Temporary Add-on** (easiest)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select any file in the extension directory

Note: Temporary add-ons are removed when Firefox closes.

**Option 2: Persistent Installation** (Firefox Developer Edition)

1. Use Firefox Developer Edition or Nightly
2. Set `xpinstall.signatures.required` to `false` in `about:config`
3. Go to `about:addons`
4. Click gear icon → **Install Add-on From File...**
5. Select the extension's `manifest.json`

## Extension Features

### DevTools Panel

Open Chrome/Firefox DevTools (`F12` or `Cmd+Opt+I`) and look for the **GxP Inspector** tab.

#### Element Selection Mode

1. Click the **selection icon** in the panel toolbar
2. Hover over elements on the page - they highlight with an orange dashed border
3. Click an element to select it - it shows a cyan pulsing glow
4. View element details in the inspector panel

#### Visual Highlighting

| State | Style |
|-------|-------|
| Hover | Orange dashed border |
| Selected | Cyan pulsing glow |
| GxP String | Blue indicator badge |

#### Smart Labels

Selected elements are labeled with context information:

```
ComponentName::element::gxp-string-key
```

Examples:
- `DemoPage::h1::welcome_title`
- `CheckInForm::button::btn_submit`
- `Header::img::logo`

This shows:
1. **Vue component name** containing the element
2. **HTML element type** (h1, button, img, etc.)
3. **GxP string key** if the element has a gxp-string attribute

### Component Inspector

View details about the selected element's Vue component:

- **Component Name** - Vue component that contains the element
- **Props** - All props passed to the component
- **Data** - Reactive data properties
- **Computed** - Computed property values
- **GxP Attributes** - gxp-string, gxp-src, gxp-state, etc.

### String Extraction

Convert hardcoded strings to GxP directives:

1. Select an element with hardcoded text
2. Click **Extract to gxp-string** in the inspector
3. Enter a key name (e.g., `welcome_title`)
4. The extension shows the suggested code change:

```html
<!-- Before -->
<h1>Welcome to the Event</h1>

<!-- After -->
<h1 gxp-string="welcome_title">Welcome to the Event</h1>
```

### Element Tree

View the DOM hierarchy with GxP element indicators:

- Elements with `gxp-string` are marked with a **S** badge
- Elements with `gxp-src` are marked with an **A** badge
- Elements with `gxp-state` are marked with a **T** badge

## Extension Architecture

### Chrome Extension (Manifest V3)

```
browser-extensions/chrome/
├── manifest.json          # Extension manifest (V3)
├── devtools.html          # DevTools page loader
├── devtools.js            # DevTools initialization
├── panel.html             # Inspector panel UI
├── panel.js               # Panel logic
├── content.js             # Content script (injected)
├── background.js          # Service worker
└── icons/                 # Extension icons
```

### Firefox Extension

```
browser-extensions/firefox/
├── manifest.json          # Extension manifest
├── devtools.html
├── devtools.js
├── panel.html
├── panel.js
├── content.js
├── background.js
└── icons/
```

## Content Script

The content script (`content.js`) is injected into your development page and provides:

### Element Highlighting

```javascript
// Highlight an element
window.postMessage({
  type: 'GXP_HIGHLIGHT_ELEMENT',
  selector: '.my-element'
}, '*');

// Clear highlights
window.postMessage({
  type: 'GXP_CLEAR_HIGHLIGHTS'
}, '*');
```

### Element Selection

```javascript
// Enable selection mode
window.postMessage({
  type: 'GXP_ENABLE_SELECTION'
}, '*');

// Listen for selection
window.addEventListener('message', (event) => {
  if (event.data.type === 'GXP_ELEMENT_SELECTED') {
    console.log('Selected:', event.data.element);
  }
});
```

### Vue Component Detection

The content script detects Vue components and exposes their data:

```javascript
// Get component info for an element
window.postMessage({
  type: 'GXP_GET_COMPONENT_INFO',
  selector: '.my-element'
}, '*');

// Receive component info
window.addEventListener('message', (event) => {
  if (event.data.type === 'GXP_COMPONENT_INFO') {
    console.log('Component:', event.data.componentName);
    console.log('Props:', event.data.props);
  }
});
```

## Building Extensions

Build extensions for distribution:

```bash
gxdev ext:build
```

This creates:

```
dist/
├── chrome/
│   └── gxp-inspector.crx    # Chrome extension package
└── firefox/
    └── gxp-inspector.xpi    # Firefox extension package
```

### Chrome Packaging

The Chrome extension is packaged using the `pack-chrome.js` script, which:
1. Creates a ZIP of the extension files
2. Can optionally sign with a private key

### Firefox Packaging

The Firefox extension is built using `web-ext`:
```bash
npx web-ext build --source-dir browser-extensions/firefox --artifacts-dir dist/firefox
```

## Reloading Extensions

After modifying extension code:

### Chrome

1. Go to `chrome://extensions`
2. Find **GxP Inspector**
3. Click the **refresh icon** on the extension card

### Firefox

1. Go to `about:debugging`
2. Find **GxP Inspector**
3. Click **Reload**

## Console Logging

The extension logs to both the page console and DevTools console:

```
[GxP Inspector] Loaded
[GxP Inspector] Element selected: h1.welcome-title
[GxP Inspector] Component: DemoPage
```

Enable verbose logging in the extension settings for debugging.

## Troubleshooting

### Extension not loading

- Ensure you're on the dev server URL (`localhost:3060`)
- Check that the extension is enabled in `chrome://extensions` or `about:addons`
- Look for errors in the browser console

### Element highlighting not working

- Refresh the page after loading the extension
- Check for `[GxP Inspector] Loaded` in the console
- Ensure the content script has permission for the page

### Vue component not detected

- Make sure Vue DevTools extension isn't conflicting
- Check that your Vue app is in development mode
- The component must be mounted when inspection starts

### Selection mode stuck

- Click the selection icon again to toggle off
- Refresh the page to reset state

## Integration with Dev Tools

The extension complements the in-browser Dev Tools:

| Feature | In-Browser Dev Tools | Browser Extension |
|---------|---------------------|-------------------|
| Store inspection | Full store editor | Read-only view |
| Element highlighting | Via store keys | Via click selection |
| String extraction | Manual | Automated |
| Component inspection | Basic | Detailed |
| Layout switching | Yes | No |
| Socket simulation | Yes | No |

Use both together for the best development experience:
- **In-browser Dev Tools** (`Ctrl+Shift+D`) for store manipulation
- **Browser Extension** for element inspection and string extraction
