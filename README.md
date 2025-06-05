# GxTools

A CLI toolkit for creating and managing GxP platform projects with modern development features.

## Quick Start

```bash
# Install globally
npm install -g @gramercytech/gx-tools

# Create new project
gxgo init my-project

# Start development
cd my-project
npm run dev
```

## Installation

**Global (Recommended)**
```bash
npm install -g @gramercytech/gx-tools
```

**Local Development Dependency**
```bash
npm install --save-dev @gramercytech/gx-tools
```

## Commands

### `gxgo init [name]`
Creates a new project or updates an existing one with all required dependencies and configurations.

```bash
gxgo init                    # Interactive mode
gxgo init my-project         # Create "my-project" directory
gxgo init                    # Update existing project (in project directory)
```

### `gxgo dev`
Starts the development server with HTTPS by default.

```bash
gxgo dev                     # HTTPS on port 3000
gxgo dev --port 4000         # Custom port
gxgo dev --no-https          # HTTP mode
```

### `gxgo build`
Builds the plugin for production.

```bash
gxgo build
```

### `gxgo setup-ssl`
Generates SSL certificates for HTTPS development.

```bash
gxgo setup-ssl
```

## Project Structure

```
my-project/
├── package.json              # Dependencies and scripts
├── .env.example              # Environment template
├── .gitignore                # Git ignore patterns
├── main.js                   # Application entry
├── server.js                 # Express + Socket.IO server
├── App.vue                   # Root Vue component
├── index.html                # HTML template
├── app-manifest.json         # Plugin manifest
├── .certs/                   # SSL certificates (auto-generated)
└── src/
    └── Plugin.vue            # Main plugin component
```

## HTTPS Development

GxTools automatically sets up HTTPS using [mkcert](https://github.com/FiloSottile/mkcert) for:
- Modern web API compatibility (Camera, Geolocation, etc.)
- Production-like environment
- Secure context testing

**Automatic Setup**: SSL certificates are generated when creating new projects.

**Manual Setup**: Run `npm run setup-ssl` to regenerate certificates.

**HTTP Fallback**: Use `npm run dev-http` if HTTPS issues occur.

## Environment Configuration

Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
```

### Key Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_PORT` | Development server port | `3000` |
| `COMPONENT_PATH` | Main component path | `./src/Plugin.vue` |
| `NODE_LOG_LEVEL` | Logging level | `info` |
| `USE_HTTPS` | Enable HTTPS | `true` |

### Configuration Priority
1. Command line arguments
2. Environment variables (`.env`)
3. Global config (`~/gxgo-default-config.json`)

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
    "dev": "gxgo dev",
    "dev-http": "gxgo dev --no-https", 
    "build": "gxgo build",
    "dev-socket": "concurrently 'gxgo dev' 'nodemon server.js'",
    "setup-ssl": "gxgo setup-ssl"
  }
}
```

## Examples

**New Project**
```bash
gxgo init my-plugin
cd my-plugin
cp .env.example .env
npm run dev
```

**Update Existing Project**
```bash
# In project directory
gxgo init
npm run dev
```

**Custom Configuration**
```bash
# Command line
gxgo dev --port 4000 --component-path ./components/Main.vue

# Environment file (.env)
NODE_PORT=4000
COMPONENT_PATH=./components/Main.vue
NODE_LOG_LEVEL=debug
```

## Troubleshooting

**Command not found**
- Verify global installation: `npm install -g @gramercytech/gx-tools`
- Check npm global path in your shell

**SSL Certificate Issues**
- Regenerate: `npm run setup-ssl`
- Use HTTP: `npm run dev-http`
- Install mkcert: `npm install -g mkcert`

**Environment Variables**
- Ensure `.env` file exists in project root
- Restart dev server after changes
- Check variable name casing

## Support

Create an issue in the project repository for bugs and feature requests.