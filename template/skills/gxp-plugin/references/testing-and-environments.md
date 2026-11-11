# Testing, linting and API environments

Before declaring done, exercise the plugin against real event shapes:

- List available events — `gxdev socket list`.
- Send one — `gxdev socket send --event <EventName>` (edit or add payloads under `socket-events/`). Use `--identifier <id>` to override which channel the event fires on.
- Hit endpoints against the local mock API via the `test_api_route` MCP tool.
- Scaffold unit tests with `test_scaffold_component_test` for any non-trivial component.

## Lint

```bash
gxdev lint           # default targets
gxdev lint --all     # everything
gxdev lint --json    # machine-readable output
```

## Testing tools

- Socket events: `gxdev socket send --event EventName` (add `--identifier <id>` to target a specific channel)
- API calls against local mock: `test_api_route` MCP tool
- Component tests: `test_scaffold_component_test` MCP tool
- AppUI components: `gxdev storybook` — browse components at `http://localhost:6006`
- Dev Tools: Press Ctrl+Shift+D
- Console: `window.gxDevTools.store()` to inspect store

## API Environments

Set `VITE_API_ENV` in `.env`:

- `mock` - Local mock server (default)
- `local` - https://dashboard.eventfinity.test
- `develop` - https://api.zenith-develop.env.eventfinity.app
- `staging` - https://api.efz-staging.env.eventfinity.app
- `production` - https://api.gramercy.cloud

## API Documentation

Prefer the MCP tools (`get_openapi_spec`, `search_api_endpoints`, `docs_search`, etc.) over fetching these URLs directly:

- OpenAPI Spec: https://api.zenith-develop.env.eventfinity.app/api-specs/openapi.json
- AsyncAPI Spec: https://api.zenith-develop.env.eventfinity.app/api-specs/asyncapi.json
- Webhooks: https://api.zenith-develop.env.eventfinity.app/api-specs/webhooks.json
