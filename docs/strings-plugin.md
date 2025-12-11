---
sidebar_position: 9
title: GxP Strings Plugin
description: Vue directives for reactive string and asset replacement from the GxP store
---

# GxP Strings Plugin

The GxP Strings Plugin provides Vue directives for automatically replacing text content and image sources with values from the GxP store. This enables dynamic, translatable, and configurable content without manual store subscriptions.

## Overview

The plugin provides two main directives:

| Directive | Purpose | Default Source |
|-----------|---------|----------------|
| `gxp-string` | Replace text content | `stringsList` |
| `gxp-src` | Replace `src` attribute | `assetList` |

Both directives support modifiers to pull from different store sections.

## Installation

The plugin is automatically included when you use the GxP Toolkit. It's registered in your app's entry point:

```javascript
// main.js (from runtime)
import { createGxpStringsPlugin } from '@gx-runtime/gxpStringsPlugin';
import { useGxpStore } from '@gx-runtime/stores/gxpPortalConfigStore';

const store = useGxpStore();
app.use(createGxpStringsPlugin(store));
```

## Basic Usage

### Text Content (gxp-string)

Replace element text with a value from the store:

```html
<!-- Default: pulls from stringsList -->
<h1 gxp-string="welcome_title">Default Welcome Text</h1>
```

**How it works:**
1. The original text "Default Welcome Text" is stored as the fallback
2. The plugin looks up `stringsList.welcome_title` in the store
3. If found, the text is replaced; otherwise, the fallback is shown
4. Changes to the store value automatically update the element

### Image Sources (gxp-src)

Replace image `src` with a value from the store:

```html
<!-- Default: pulls from assetList -->
<img gxp-src="hero_image" src="/dev-assets/placeholder.jpg" alt="Hero">
```

**How it works:**
1. The original `src` is stored as the fallback
2. The plugin looks up `assetList.hero_image` in the store
3. If found, the `src` is replaced; otherwise, the fallback is used
4. Changes to the store value automatically update the image

## Store Sections

### Strings (stringsList)

For translatable text content. Configure in `app-manifest.json`:

```json
{
  "strings": {
    "default": {
      "welcome_title": "Welcome to the Event",
      "welcome_subtitle": "Please check in below",
      "btn_checkin": "Check In",
      "btn_cancel": "Cancel"
    }
  }
}
```

Use in templates:

```html
<h1 gxp-string="welcome_title">Welcome</h1>
<p gxp-string="welcome_subtitle">Check in here</p>
<button gxp-string="btn_checkin">Submit</button>
```

### Settings (pluginVars)

For configuration values. Use the `gxp-settings` modifier:

```json
{
  "settings": {
    "company_name": "TechConf 2024",
    "event_date": "January 15-17, 2024",
    "max_badge_prints": 3
  }
}
```

```html
<span gxp-string="company_name" gxp-settings>Company Name</span>
<span gxp-string="event_date" gxp-settings>Event Date</span>
```

### Assets (assetList)

For image and media URLs. Default for `gxp-src`:

```json
{
  "assets": {
    "logo": "/dev-assets/images/logo.png",
    "hero_image": "/dev-assets/images/hero.jpg",
    "background": "/dev-assets/images/bg-pattern.svg"
  }
}
```

```html
<img gxp-src="logo" src="/placeholder.png" alt="Logo">
<img gxp-src="hero_image" src="/placeholder.jpg" alt="Hero">
```

For text output of asset URLs, use `gxp-assets` modifier:

```html
<span gxp-string="logo" gxp-assets>/default/logo.png</span>
```

### Trigger State (triggerState)

For dynamic runtime values. Use the `gxp-state` modifier:

```json
{
  "triggerState": {
    "current_step": 1,
    "checked_in_count": 0,
    "current_status": "ready"
  }
}
```

```html
<span gxp-string="current_step" gxp-state>1</span>
<span gxp-string="current_status" gxp-state>loading</span>
<img gxp-src="dynamic_badge" gxp-state src="/placeholder.jpg">
```

## Directive Reference

### gxp-string

Replace text content of an element.

| Modifier | Source | Example |
|----------|--------|---------|
| (none) | `stringsList` | `<h1 gxp-string="title">Default</h1>` |
| `gxp-settings` | `pluginVars` | `<span gxp-string="company" gxp-settings>Acme</span>` |
| `gxp-assets` | `assetList` | `<span gxp-string="logo_url" gxp-assets>/logo.png</span>` |
| `gxp-state` | `triggerState` | `<span gxp-string="status" gxp-state>idle</span>` |

### gxp-src

Replace `src` attribute of an element (typically `<img>`).

| Modifier | Source | Example |
|----------|--------|---------|
| (none) | `assetList` | `<img gxp-src="hero" src="/fallback.jpg">` |
| `gxp-state` | `triggerState` | `<img gxp-src="badge_url" gxp-state src="/fallback.jpg">` |

## Dynamic Updates

The plugin automatically watches for store changes and updates elements reactively.

### From Code

```javascript
const store = useGxpStore();

// Update a string - all gxp-string="welcome_title" elements update
store.updateString('welcome_title', 'Welcome Back!');

// Update a setting - all gxp-string="company" gxp-settings elements update
store.updateSetting('company_name', 'NewTech 2024');

// Update an asset - all gxp-src="logo" elements update
store.updateAsset('logo', '/new-logo.png');

// Update state - all gxp-state elements for this key update
store.updateState('current_step', 2);
```

### From Dev Tools

Use the in-browser Dev Tools (`Ctrl+Shift+D`) to:
1. Open the **Store Inspector** tab
2. Find the key you want to change
3. Double-click to edit the value
4. Changes reflect immediately in the UI

### From Manifest Hot Reload

Edit `app-manifest.json` during development - changes hot-reload automatically:

```json
{
  "strings": {
    "default": {
      "welcome_title": "New Welcome Message"  // Change this
    }
  }
}
```

Save the file and the UI updates without page refresh.

## Fallback Behavior

The plugin maintains the original content as a fallback:

```html
<h1 gxp-string="welcome_title">This is the fallback</h1>
```

| Scenario | Displayed Text |
|----------|---------------|
| `stringsList.welcome_title` exists | Value from store |
| `stringsList.welcome_title` is empty string | Empty string |
| `stringsList.welcome_title` is undefined | "This is the fallback" |
| Manifest hasn't loaded yet | "This is the fallback" |

This ensures:
- No broken UI during initial load
- Graceful degradation if store keys are missing
- Clear default values visible in source code

## Attribute Syntax

You can use either the directive or attribute syntax:

```html
<!-- Vue directive syntax -->
<h1 v-gxp-string="'welcome_title'">Default</h1>

<!-- Attribute syntax (recommended) -->
<h1 gxp-string="welcome_title">Default</h1>
```

The attribute syntax is preferred as it's cleaner and the plugin handles both automatically.

## Multiple Modifiers

Modifiers are mutually exclusive. Use only one source modifier per element:

```html
<!-- Correct -->
<span gxp-string="company" gxp-settings>Default</span>
<span gxp-string="status" gxp-state>idle</span>

<!-- Incorrect - don't combine modifiers -->
<span gxp-string="value" gxp-settings gxp-state>Default</span>
```

## Use with Vue Bindings

Combine with Vue's reactive bindings:

```html
<!-- Dynamic key from Vue data -->
<h1 :gxp-string="currentTitleKey">Default</h1>

<!-- Conditional class based on state -->
<span
  gxp-string="status"
  gxp-state
  :class="{ active: store.getState('is_active') }"
>
  idle
</span>

<!-- Use alongside other attributes -->
<img
  gxp-src="avatar"
  :alt="store.getString('avatar_alt', 'User Avatar')"
  class="user-avatar"
>
```

## Programmatic Processing

For advanced use cases, process elements manually:

```javascript
import { processGxpStrings, processGxpSrcs } from '@gx-runtime/gxpStringsPlugin';
import { useGxpStore } from '@gx-runtime/stores/gxpPortalConfigStore';

const store = useGxpStore();

// Process all gxp-string elements in a container
const container = document.querySelector('.my-container');
processGxpStrings(container, store);

// Process all gxp-src elements
processGxpSrcs(container, store);
```

### Utility Functions

```javascript
import { getGxpStringKey, hasGxpString } from '@gx-runtime/gxpStringsPlugin';

// Check if element has gxp-string
if (hasGxpString(element)) {
  const key = getGxpStringKey(element);
  console.log(`Element uses string key: ${key}`);
}
```

## Performance Considerations

### Watchers

Each element with a directive creates a Vue watcher. For large lists, consider:

```html
<!-- Less efficient: watcher per item -->
<li v-for="item in items" :key="item.id">
  <span gxp-string="item_label">Label</span>
</li>

<!-- More efficient: use computed string -->
<li v-for="item in items" :key="item.id">
  {{ store.getString('item_label', 'Label') }}
</li>
```

### Initial Load

The plugin handles async manifest loading gracefully:
1. Elements show fallback values immediately
2. When manifest loads, all elements update
3. No flash of incorrect content

## Best Practices

### 1. Always Provide Fallbacks

```html
<!-- Good: clear fallback -->
<h1 gxp-string="welcome_title">Welcome to Our Event</h1>

<!-- Avoid: empty fallback -->
<h1 gxp-string="welcome_title"></h1>
```

### 2. Use Descriptive Keys

```html
<!-- Good: descriptive keys -->
<button gxp-string="btn_checkin_submit">Submit</button>
<button gxp-string="btn_checkin_cancel">Cancel</button>

<!-- Avoid: generic keys -->
<button gxp-string="button1">Submit</button>
<button gxp-string="button2">Cancel</button>
```

### 3. Group Related Strings

In your manifest:

```json
{
  "strings": {
    "default": {
      "checkin_title": "Check In",
      "checkin_subtitle": "Scan your badge",
      "checkin_btn_submit": "Check In Now",
      "checkin_btn_cancel": "Cancel",
      "checkin_success": "You're all set!",
      "checkin_error": "Something went wrong"
    }
  }
}
```

### 4. Use Dev Assets for Images

```html
<!-- Good: fallback to dev asset -->
<img gxp-src="hero" src="/dev-assets/images/placeholder.jpg" alt="Hero">

<!-- Avoid: no fallback -->
<img gxp-src="hero" alt="Hero">
```

### 5. Scan for Hardcoded Strings

Regularly scan for strings that should be extracted:

```bash
gxdev datastore scan-strings --component src/Plugin.vue
```

## Troubleshooting

### Strings not updating

1. Verify the key exists in `app-manifest.json`
2. Check for typos in key names (case-sensitive)
3. Ensure the manifest has loaded (check console for `[GxP Store] Loaded`)
4. Verify you're using the correct modifier

### Fallback always showing

1. The store value might be `undefined` or missing
2. Check the manifest JSON syntax is valid
3. Verify the key path: `strings.default.key` for strings

### Images not loading

1. Check the asset URL is correct
2. Verify the dev server is running
3. For dev assets, ensure the file exists in `dev-assets/images/`

### Hot reload not working

1. Check Vite HMR is connected (no red overlay)
2. Verify `app-manifest.json` has valid JSON
3. Try a full page refresh

### Performance issues

1. Reduce number of directive elements in lists
2. Use computed properties for frequently accessed values
3. Consider grouping related updates
