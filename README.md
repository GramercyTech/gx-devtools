# GxToolkit

A CLI toolkit for creating and managing GxP platform projects with modern development features.

## Quick Start

```bash
# Install globally
npm install -g @gramercytech/gx-toolkit

# Create new project
gxto init my-project

# Start development
cd my-project
npm run dev
```

## Installation

**Global (Recommended)**
```bash
npm install -g @gramercytech/gx-toolkit
```

**Local Development Dependency**
```bash
npm install --save-dev @gramercytech/gx-toolkit
```

## Commands

### `gxto init [name]`
Creates a new project or updates an existing one with all required dependencies and configurations.

During initialization, you'll be prompted to:
- Include GxP Datastore (optional Pinia-based state management)
- Set up SSL certificates for HTTPS development

```bash
gxto init                    # Interactive mode
gxto init my-project         # Create "my-project" directory
gxto init                    # Update existing project (in project directory)
```

### `gxto dev`
Starts the development server with HTTPS by default.

The tool will automatically load your `.env` file if it exists and show you which port it's using.

```bash
gxto dev                     # HTTPS on port 3000 (or from .env)
gxto dev --port 4000         # Custom port (overrides .env)
gxto dev --no-https          # HTTP mode
```

### `gxto build`
Builds the plugin for production.

```bash
gxto build
```

### `gxto setup-ssl`
Generates SSL certificates for HTTPS development.

```bash
gxto setup-ssl
```

### Browser Extension Commands

### `gxto ext:firefox`
Launches Firefox with your browser extension loaded for testing.

```bash
gxto ext:firefox
```

### `gxto ext:chrome`
Launches Chrome with your browser extension loaded for testing.

```bash
gxto ext:chrome
```

### `gxto ext:build`
Builds both Firefox and Chrome extensions for distribution.

```bash
gxto ext:build
```

## Project Structure

```
my-project/
├── package.json              # Dependencies and scripts
├── .env.example              # Environment template
├── .gitignore                # Git ignore patterns
├── main.js                   # Development entry point
├── server.js                 # Development server (Express + Socket.IO)
├── App.vue                   # Development container (mimics platform)
├── AdvancedExample.vue       # Advanced workflow reference
├── index.html                # Development HTML template
├── app-manifest.json         # Plugin manifest
├── .certs/                   # SSL certificates (auto-generated)
├── browser-extensions/       # Browser extensions
│   ├── chrome/               # Chrome extension
│   └── firefox/              # Firefox extension
├── scripts/                  # Extension management scripts
│   ├── launch-chrome.js      # Chrome extension launcher
│   └── pack-chrome.js        # Chrome extension packager
└── src/
    └── Plugin.vue            # Your app root component (production entry)
```

## HTTPS Development

GxToolkit automatically sets up HTTPS using [mkcert](https://github.com/FiloSottile/mkcert) for:
- Modern web API compatibility (Camera, Geolocation, etc.)
- Production-like environment
- Secure context testing
- Secure WebSocket connections (Socket.IO)

**Interactive Setup**: You'll be prompted to set up SSL certificates when creating new projects.

**Manual Setup**: Run `npm run setup-ssl` to regenerate certificates.

**HTTP Fallback**: Use `npm run dev-http` if HTTPS issues occur.

**Socket.IO SSL**: When SSL certificates are present, both the main server and Socket.IO server automatically use HTTPS for secure connections.

## Environment Configuration

The `.env` file is automatically created from `.env.example` during project initialization. Customize as needed:

### Key Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_PORT` | Development server port | `3060` |
| `SOCKET_IO_PORT` | SocketIO server port | `3061` |
| `COMPONENT_PATH` | Main component path | `./src/Plugin.vue` |
| `NODE_LOG_LEVEL` | Logging level | `info` |
| `USE_HTTPS` | Enable HTTPS | `true` |

### Configuration Priority
1. Command line arguments (highest priority)
2. Environment variables from `.env` file
3. Global config (`~/gxto-default-config.json`)
4. Built-in defaults (lowest priority)

## Dependencies

**Runtime**
- Vue 3, Vite, Express, Socket.IO, CORS

**Development**  
- mkcert, nodemon, concurrently, dotenv

## Scripts

Added to your `package.json`:

```json
{
  "scripts": {
    "dev": "gxto dev --with-socket",
    "dev-app": "gxto dev",
    "dev-http": "gxto dev --no-https", 
    "build": "gxto build",
    "setup-ssl": "gxto setup-ssl",
    "ext:firefox": "gxto ext:firefox",
    "ext:chrome": "gxto ext:chrome",
    "ext:build": "gxto ext:build"
  }
}
```

## Examples

**New Project**
```bash
gxto init my-plugin
cd my-plugin
npm run dev
```

**Update Existing Project**
```bash
# In project directory
gxto init
npm run dev
```

**Custom Configuration**
```bash
# Command line
gxto dev --port 4000 --component-path ./components/Main.vue

# Environment file (.env)
NODE_PORT=4000
COMPONENT_PATH=./components/Main.vue
NODE_LOG_LEVEL=debug
```

**Browser Extension Development**
```bash
# Test Firefox extension
npm run ext:firefox

# Test Chrome extension  
npm run ext:chrome

# Build extensions for distribution
npm run ext:build
```

## Troubleshooting

**Command not found**
- Verify global installation: `npm install -g @gramercytech/gx-toolkit`
- Check npm global path in your shell

**SSL Certificate Issues**
- Regenerate: `npm run setup-ssl`
- Use HTTP: `npm run dev-http`
- Install mkcert: `npm install -g mkcert`

**Environment Variables**
- Ensure `.env` file exists in project root
- Restart dev server after changes
- Check variable name casing

**Loading Component in Production**
- When loading the component in dev vs production, dev requires the index.html file within the project to preload the externalized Vue library, loading vue within the project in dev will cause a multiple vue defintion error if run within production via the browser extension

## Support

Create an issue in the project repository for bugs and feature requests.