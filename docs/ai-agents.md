---
sidebar_position: 12
title: AI Agent Configuration
description: Configure AI coding assistants with GxP-specific knowledge and API access
---

# AI Agent Configuration

The GxP Toolkit includes pre-configured agent files for popular AI coding assistants. These agents understand the GxP architecture and can help you build plugins more effectively.

## Overview

When you create a new project with `gxdev init`, the following AI configuration files are automatically included:

| File | AI Tool | Purpose |
|------|---------|---------|
| `.claude/agents/gxp-developer.md` | Claude Code | Subagent for GxP development |
| `.claude/settings.json` | Claude Code | MCP server configuration |
| `AGENTS.md` | OpenAI Codex | Agent instructions |
| `GEMINI.md` | Google Gemini | Code Assist instructions |

## What the Agents Know

All agents are configured to understand:

1. **GxP Architecture** - The runtime container model where your `Plugin.vue` runs inside the platform environment
2. **Store Integration** - How to use `gxpPortalConfigStore` for strings, settings, assets, and state
3. **API Calls** - The correct way to make API requests through the store (never raw axios/fetch)
4. **WebSocket Events** - How to listen for and emit real-time events
5. **Component Kit** - Available UI components from `@gramercytech/gx-componentkit`
6. **Vue Directives** - Using `gxp-string` and `gxp-src` for dynamic content

## Claude Code Setup

### Subagent

The `.claude/agents/gxp-developer.md` file defines a specialized GxP developer subagent. Claude Code automatically discovers this agent and can use it when working on your project.

To invoke the agent:
```
Use the gxp-developer agent to help with this component
```

### MCP Server for API Specs

The toolkit includes an MCP (Model Context Protocol) server that provides Claude Code with access to the GxP API documentation. This server:

- Fetches OpenAPI and AsyncAPI specs from the configured environment
- Provides search tools for finding endpoints and events
- Caches specs for performance

The MCP configuration in `.claude/settings.json`:

```json
{
  "mcpServers": {
    "gxp-api": {
      "command": "gxp-api-server",
      "args": [],
      "env": {}
    }
  }
}
```

#### Available MCP Tools

| Tool | Description |
|------|-------------|
| `get_openapi_spec` | Fetch the complete OpenAPI specification |
| `get_asyncapi_spec` | Fetch the AsyncAPI specification for WebSocket events |
| `search_api_endpoints` | Search endpoints by path, summary, or tags |
| `search_websocket_events` | Search WebSocket channels and events |
| `get_endpoint_details` | Get detailed info about a specific endpoint |
| `get_api_environment` | Get current environment configuration |

The MCP server reads `VITE_API_ENV` from your `.env` file to determine which API environment to use.

## OpenAI Codex Setup

The `AGENTS.md` file at the project root provides instructions for OpenAI Codex CLI. Codex automatically reads this file when working in your project directory.

Key sections in the agent file:
- Architecture overview
- Store usage patterns
- API call guidelines
- WebSocket event handling
- Available components

## Google Gemini Setup

The `GEMINI.md` file provides concise instructions for Gemini Code Assist. This format is optimized for Gemini's context handling.

## API Documentation URLs

The agents reference API specs from these endpoints based on your environment:

| Environment | OpenAPI | AsyncAPI |
|-------------|---------|----------|
| `develop` | `api.zenith-develop.env.eventfinity.app/api-specs/openapi.json` | `api.zenith-develop.env.eventfinity.app/api-specs/asyncapi.json` |
| `staging` | `api.efz-staging.env.eventfinity.app/api-specs/openapi.json` | `api.efz-staging.env.eventfinity.app/api-specs/asyncapi.json` |
| `production` | `api.gramercy.cloud/api-specs/openapi.json` | `api.gramercy.cloud/api-specs/asyncapi.json` |

## Critical Rules for AI Assistants

The agent files emphasize these critical rules:

### 1. Never Use Raw HTTP Clients

```javascript
// WRONG - Never do this
const response = await axios.get('/api/v1/attendees');
const data = await fetch('/api/v1/attendees');

// CORRECT - Always use the store
const store = useGxpStore();
const data = await store.apiGet('/api/v1/attendees');
```

### 2. Use Store API Methods

The store handles:
- Authentication token injection
- Base URL configuration per environment
- CORS proxy in development
- Error handling

```javascript
// Available methods
await store.apiGet('/endpoint', { params });
await store.apiPost('/endpoint', data);
await store.apiPut('/endpoint/id', data);
await store.apiPatch('/endpoint/id', data);
await store.apiDelete('/endpoint/id');
```

### 3. Use Dynamic Content Directives

```html
<!-- Text from strings -->
<h1 gxp-string="welcome_title">Default Title</h1>

<!-- Text from settings -->
<span gxp-string="company_name" gxp-settings>Company</span>

<!-- Images from assets -->
<img gxp-src="hero_image" src="/placeholder.jpg">
```

### 4. WebSocket Events Through Store

```javascript
// Listen for events
store.listenSocket('primary', 'EventName', (data) => {
  console.log('Received:', data);
});

// Emit events
store.emitSocket('primary', 'event-name', { data: 'value' });
```

## Customizing Agent Files

You can customize the agent files for your specific project:

1. **Add project-specific patterns** - Document your component conventions
2. **Include API usage examples** - Add examples relevant to your plugin
3. **Reference custom dependencies** - List any additional libraries you use

Example customization in `AGENTS.md`:

```markdown
## Project-Specific Patterns

This plugin uses the following conventions:
- All views are in `src/views/`
- Composables are in `src/composables/`
- The main API endpoints we use are:
  - GET /api/v1/events/{id}/attendees
  - POST /api/v1/check-ins
```

## Troubleshooting

### MCP Server Not Working

1. Ensure `gxp-api-server` is in your PATH:
   ```bash
   which gxp-api-server
   ```

2. Test the server manually:
   ```bash
   echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | gxp-api-server
   ```

3. Check your `.env` file has a valid `VITE_API_ENV` value

### Agent Not Being Used

For Claude Code:
- Ensure `.claude/agents/gxp-developer.md` exists
- The file must have valid YAML frontmatter

For Codex:
- Ensure `AGENTS.md` is at the project root
- Run `codex` from within the project directory

For Gemini:
- Ensure `GEMINI.md` is at the project root
- Enable Gemini Code Assist in your IDE
