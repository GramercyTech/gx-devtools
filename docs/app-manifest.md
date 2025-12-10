---
sidebar_position: 3
title: App Manifest
description: Configure your plugin with settings, strings, assets, and more
---

# App Manifest

The `app-manifest.json` file is the central configuration for your GxP plugin. It defines settings, translatable strings, assets, and runtime state that the platform injects into your plugin.

## File Location

The manifest file should be in your project root:

```
my-plugin/
├── app-manifest.json    # <-- Here
├── src/
└── ...
```

## Basic Structure

```json
{
  "settings": {},
  "strings": {},
  "assets": {},
  "triggerState": {},
  "dependencies": [],
  "permissions": []
}
```

## Configuration Sections

### Settings (`pluginVars`)

Define configurable settings that administrators can customize per deployment:

```json
{
  "settings": {
    "primary_color": "#FFD600",
    "background_color": "#ffffff",
    "company_name": "Acme Corp",
    "max_items": 10,
    "enable_animations": true
  }
}
```

Access in your component:

```javascript
const store = useGxpStore();

// Get a setting with fallback
const color = store.getSetting('primary_color', '#000000');

// Check if setting exists
if (store.pluginVars.enable_animations) {
  // ...
}
```

Use in templates with the `gxp-settings` modifier:

```html
<span gxp-string="company_name" gxp-settings>Default Company</span>
```

### Strings (`stringsList`)

Define translatable text content:

```json
{
  "strings": {
    "default": {
      "welcome_title": "Welcome to the Event",
      "welcome_subtitle": "Please check in below",
      "button_checkin": "Check In",
      "button_cancel": "Cancel",
      "error_not_found": "Registration not found"
    }
  }
}
```

Use in templates with the `gxp-string` directive:

```html
<h1 gxp-string="welcome_title">Default Welcome</h1>
<button gxp-string="button_checkin">Check In</button>
```

Access programmatically:

```javascript
const store = useGxpStore();
const title = store.getString('welcome_title', 'Default Title');
```

:::tip Hot Reload
Changes to strings in `app-manifest.json` are hot-reloaded during development. No page refresh needed!
:::

### Assets (`assetList`)

Define asset URLs (images, documents, etc.):

```json
{
  "assets": {
    "hero_image": "/dev-assets/images/hero.jpg",
    "logo": "/dev-assets/images/logo.png",
    "background": "/dev-assets/images/bg-pattern.svg",
    "welcome_video": "/dev-assets/videos/intro.mp4"
  }
}
```

Use in templates with the `gxp-src` directive:

```html
<img gxp-src="hero_image" src="/dev-assets/placeholder.jpg" alt="Hero" />
<img gxp-src="logo" src="/dev-assets/placeholder.jpg" alt="Logo" />
```

Access programmatically:

```javascript
const store = useGxpStore();
const heroUrl = store.getAsset('hero_image', '/fallback.jpg');
```

### Trigger State (`triggerState`)

Define dynamic runtime state that can change during plugin execution:

```json
{
  "triggerState": {
    "is_active": true,
    "current_step": 1,
    "checked_in_count": 0,
    "last_scan_result": null
  }
}
```

Use in templates with the `gxp-state` modifier:

```html
<span gxp-string="current_step" gxp-state>1</span>
<img gxp-src="dynamic_badge" gxp-state src="/placeholder.jpg" />
```

Update programmatically:

```javascript
const store = useGxpStore();

// Update state
store.updateState('current_step', 2);
store.updateState('checked_in_count', store.triggerState.checked_in_count + 1);

// Read state
const step = store.getState('current_step', 1);
```

### Dependencies

Define external services or plugins this plugin depends on:

```json
{
  "dependencies": [
    {
      "id": "badge-printer",
      "type": "hardware",
      "required": true
    },
    {
      "id": "registration-api",
      "type": "api",
      "required": true
    }
  ]
}
```

### Permissions

Define permissions required by the plugin:

```json
{
  "permissions": [
    "camera",
    "bluetooth",
    "notifications"
  ]
}
```

Check permissions in code:

```javascript
const store = useGxpStore();

if (store.hasPermission('camera')) {
  // Enable camera features
}
```

## Complete Example

```json
{
  "settings": {
    "primary_color": "#FFD600",
    "secondary_color": "#1976D2",
    "company_name": "TechConf 2024",
    "check_in_timeout": 30,
    "enable_badge_printing": true
  },
  "strings": {
    "default": {
      "welcome_title": "Welcome to TechConf 2024",
      "welcome_subtitle": "Scan your QR code to check in",
      "btn_manual_entry": "Enter Code Manually",
      "btn_help": "Need Help?",
      "success_message": "You're all set!",
      "error_invalid_code": "Invalid code. Please try again.",
      "error_already_checked_in": "You've already checked in."
    }
  },
  "assets": {
    "logo": "/dev-assets/images/techconf-logo.png",
    "hero_background": "/dev-assets/images/hero-bg.jpg",
    "success_animation": "/dev-assets/animations/success.json"
  },
  "triggerState": {
    "is_scanning": false,
    "current_attendee": null,
    "badge_printing": false
  },
  "dependencies": [],
  "permissions": ["camera"]
}
```

## Directive Reference

| Directive | Modifier | Source | Example |
|-----------|----------|--------|---------|
| `gxp-string` | (none) | `stringsList` | `<h1 gxp-string="title">Default</h1>` |
| `gxp-string` | `gxp-settings` | `pluginVars` | `<span gxp-string="company" gxp-settings>Acme</span>` |
| `gxp-string` | `gxp-assets` | `assetList` | `<span gxp-string="logo_url" gxp-assets>/logo.png</span>` |
| `gxp-string` | `gxp-state` | `triggerState` | `<span gxp-string="count" gxp-state>0</span>` |
| `gxp-src` | (none) | `assetList` | `<img gxp-src="hero" src="/placeholder.jpg" />` |
| `gxp-src` | `gxp-state` | `triggerState` | `<img gxp-src="badge" gxp-state src="/placeholder.jpg" />` |

## Best Practices

1. **Use descriptive keys** - `welcome_title` is better than `title1`
2. **Provide defaults** - Always include fallback text in your templates
3. **Group related strings** - Keep related strings together for easier management
4. **Use dev-assets for development** - Put placeholder images in `dev-assets/images/`
5. **Keep settings minimal** - Only expose settings that need admin configuration
