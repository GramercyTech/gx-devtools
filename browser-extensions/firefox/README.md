# Traffic Proxy Firefox Extension

A Firefox extension that intercepts and redirects web traffic to alternative domains based on configurable regex patterns.

## Features

- 🔄 **Traffic Interception**: Intercepts fetch calls and XMLHttpRequests
- 🎯 **Regex Pattern Matching**: Flexible domain matching using regular expressions
- 🔴🟢 **Visual Toggle**: Red/green toolbar button indicating proxy status
- ⚙️ **Settings Panel**: Easy-to-use interface for managing proxy rules
- 🔔 **Notifications**: Real-time notifications when traffic is being proxied
- 💾 **Persistent Storage**: Rules and settings are saved between browser sessions

## Installation

### Method 1: Temporary Installation (Development)

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox" on the left sidebar
3. Click "Load Temporary Add-on"
4. Navigate to the extension folder and select `manifest.json`

### Method 2: Creating an XPI Package

1. Zip all extension files:
   ```bash
   zip -r traffic-proxy-extension.xpi manifest.json background.js content.js popup.html popup.js icons/
   ```
2. Install the XPI file through Firefox's Add-ons manager

## Icon Setup

The extension includes SVG icon files that need to be converted to PNG format:

1. Open `icons/create_icons.html` in your browser
2. Click the download buttons to get PNG files
3. Save them in the `icons/` directory with the correct names

Alternatively, use an online SVG to PNG converter for the files in `icons/`.

## Usage

### Enabling the Proxy

1. Look for the Traffic Proxy button in your Firefox toolbar
2. Click the button to open the settings panel
3. Click the toggle button to enable/disable the proxy
   - 🔴 Red = OFF
   - 🟢 Green = ON

### Adding Proxy Rules

1. Open the extension settings panel
2. Click "+ Add Rule"
3. Enter a regex pattern for the domain to intercept (e.g., `api\.example\.com`)
4. Enter the redirect domain (e.g., `api.alternative.com`)
5. Click "Save Changes"

### Example Rules

| Pattern               | Redirect To           | Description                                                |
| --------------------- | --------------------- | ---------------------------------------------------------- |
| `api\.example\.com`   | `api.alternative.com` | Redirect all API calls from example.com to alternative.com |
| `.*\.googleapis\.com` | `api.myproxy.com`     | Redirect all Google API calls to your proxy server         |
| `cdn\.jsdelivr\.net`  | `my-cdn.example.com`  | Redirect CDN requests to your own server                   |

## How It Works

1. **Background Script**: Handles webRequest interception and manages extension state
2. **Content Script**: Intercepts JavaScript fetch() and XMLHttpRequest calls
3. **Popup Interface**: Provides user interface for configuration
4. **Storage**: Saves rules and settings using Firefox's local storage API

## Permissions

The extension requires the following permissions:

- `webRequest` & `webRequestBlocking`: To intercept and modify network requests
- `<all_urls>`: To intercept requests from any website
- `storage`: To save proxy rules and settings
- `notifications`: To show proxy activity notifications
- `activeTab`: To access the current tab information

## Development

### File Structure

```
├── manifest.json          # Extension manifest
├── background.js          # Background script (main logic)
├── content.js            # Content script (fetch/XHR interception)
├── popup.html            # Settings panel HTML
├── popup.js              # Settings panel JavaScript
├── icons/                # Extension icons
│   ├── icon-off-*.png    # Red icons (proxy disabled)
│   └── icon-on-*.png     # Green icons (proxy enabled)
└── README.md             # This file
```

### Testing

1. Enable the extension
2. Add a test rule (e.g., `httpbin\.org` → `postman-echo.com`)
3. Visit a website that makes requests to the target domain
4. Check the browser's Network tab to verify redirections
5. Verify notifications appear when traffic is proxied

## Security Considerations

- This extension can intercept ALL network traffic when enabled
- Only install from trusted sources
- Review proxy rules carefully before enabling
- Be aware that redirected traffic may be logged by the target servers

## Troubleshooting

### Extension Not Working

- Check that the extension is enabled in `about:addons`
- Verify permissions are granted
- Check browser console for errors

### Icons Not Showing

- Ensure PNG icon files exist in the `icons/` directory
- Convert SVG files to PNG if needed
- Check file permissions

### Rules Not Matching

- Test regex patterns using online regex testers
- Ensure domains are properly escaped (use `\.` for literal dots)
- Check that the proxy is enabled (green button)

## License

This extension is provided as-is for educational and development purposes.
