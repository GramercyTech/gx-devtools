# GxP Plugin — Claude Code Instructions

This is a GxP plugin project for the GxP kiosk platform. Use the shared
project guidelines below for everything you do here.

## Project guidelines (shared with Codex/Cursor)

@AGENTS.md

## Claude Code specifics

- **Subagent:** `.claude/agents/gxp-developer.md` — auto-invoked for GxP
  plugin tasks. Use it for any non-trivial Vue/store/`callApi` work.
- **MCP servers:** wired in `.mcp.json` at the project root.
  - `gxp-api` (via `mcp-serve` on PATH) — API specs, data models,
    config/manifest editing, docs search, test helpers.
  - `gxp-uikit-storybook` — UIKit component/story tools (only available
    when `gxdev storybook` is running, served at
    `http://localhost:6006/mcp`).
- **Settings:** `.claude/settings.json` — pre-allows the `gxp-api` MCP
  tools so you don't get prompted on every call.

If the `api_*` / `config_*` / `docs_*` MCP tools aren't available, run
`claude mcp add gxp-api mcp-serve` and restart the session before
proceeding. Do not invent endpoints — discover them through the MCP.
