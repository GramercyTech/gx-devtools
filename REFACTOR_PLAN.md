# GxP Toolkit Refactoring Plan

## Status: COMPLETED

All major refactoring phases have been completed. This document is kept for reference.

---

## Phase 1: CLI Refactoring ✅ COMPLETED

### Goal
Break `bin/gx-toolkit.js` (2407 lines) into focused modules while maintaining backward compatibility.

### Final Structure
```
bin/
├── gx-toolkit.js          # Entry point (~25 lines) - delegates to lib/cli.js
└── lib/
    ├── cli.js             # Yargs command definitions
    ├── constants.js       # Dependencies, scripts, ports
    ├── commands/
    │   ├── init.js        # gxtk init
    │   ├── dev.js         # gxtk dev
    │   ├── build.js       # gxtk build
    │   ├── publish.js     # gxtk publish
    │   ├── ssl.js         # gxtk setup-ssl
    │   ├── datastore.js   # gxtk datastore <action>
    │   ├── socket.js      # gxtk socket <action>
    │   ├── assets.js      # gxtk assets <action>
    │   ├── extensions.js  # gxtk ext:*
    │   └── index.js       # Re-exports all commands
    └── utils/
        ├── paths.js       # Path resolution (findProjectRoot, resolveGxPaths, etc.)
        ├── ssl.js         # SSL certificate management
        ├── files.js       # File operations (safeCopyFile, etc.)
        ├── prompts.js     # User prompts (promptUser)
        └── index.js       # Re-exports all utilities
```

### Completed Tasks
- [x] Create `bin/lib/` directory structure
- [x] Extract path resolution utilities to `utils/paths.js`
- [x] Extract SSL management to `utils/ssl.js`
- [x] Extract file utilities to `utils/files.js`
- [x] Extract prompts to `utils/prompts.js`
- [x] Extract dependency constants to `constants.js`
- [x] Create individual command modules
- [x] Update main entry point to use modular CLI
- [x] Test all commands work identically
- [x] Renamed CLI command from `gxto` to `gxtk`

---

## Phase 2: Folder Structure Cleanup ✅ COMPLETED

### Goal
Clean up the template system and establish clear boundaries.

### Final Structure
```
gx-toolkit/
├── bin/                    # CLI (refactored)
│   └── lib/                # Modular CLI components
├── template/               # Files copied to new projects during init
│   ├── src/
│   │   ├── Plugin.vue      # User's entry point (editable)
│   │   ├── DemoPage.vue    # Example component (editable)
│   │   └── stores/         # Store templates
│   ├── theme-layouts/      # Layout templates (editable)
│   ├── dev-assets/         # Placeholder images
│   ├── main.js             # Dev entry point (imports from @gx-runtime)
│   ├── index.html
│   ├── vite.config.js      # Project vite config with aliases
│   ├── app-manifest.json
│   ├── env.example
│   ├── gitignore
│   └── README.md
├── runtime/                # Files used from node_modules (NOT copied)
│   ├── PortalContainer.vue # Platform emulator (immutable)
│   ├── server.js           # Socket.IO server
│   ├── dev-tools/          # In-browser dev tools
│   │   ├── DevToolsModal.vue
│   │   ├── StoreInspector.vue
│   │   ├── LayoutSwitcher.vue
│   │   ├── SocketSimulator.vue
│   │   └── MockDataEditor.vue
│   └── stores/
│       └── gxpPortalConfigStore.js
├── socket-events/          # Event templates (single source of truth)
├── browser-extensions/     # Chrome/Firefox extensions
└── scripts/                # Build/launch scripts
```

### Completed Tasks
- [x] Create `/runtime/` directory
- [x] Move PortalContainer.vue to /runtime/
- [x] Move server.js to /runtime/
- [x] Move gxpPortalConfigStore.js to /runtime/stores/
- [x] Consolidate socket-events to single location
- [x] Update CLI path resolution
- [x] Update template/main.js to import from @gx-runtime
- [x] Update template/vite.config.js with aliases (@, @layouts, @gx-runtime)
- [x] Test `gxtk init` creates correct project structure

---

## Phase 3: PortalContainer Immutability ✅ COMPLETED

### Goal
Make PortalContainer.vue truly hidden from client projects while still functional for development.

### Implementation
- PortalContainer.vue is in `/runtime/` (NOT copied during init)
- Client's main.js imports via Vite alias: `import App from "@gx-runtime/PortalContainer.vue"`
- Vite config defines `@gx-runtime` alias pointing to toolkit's runtime directory

### Completed Tasks
- [x] Move PortalContainer.vue to /runtime/
- [x] Update template/main.js import path
- [x] Update template/vite.config.js with @gx-runtime alias
- [x] Test development server loads PortalContainer from node_modules
- [x] Document this architecture in CLAUDE.md

---

## Phase 4: Dev Tools Configuration Modal ✅ COMPLETED

### Goal
Create an in-browser development tools modal.

### Features Implemented
1. **Store Inspector** - View/edit pluginVars, stringsList, assetList, triggerState, dependencyList
2. **Layout Switcher** - Toggle between System/Private/Public layouts
3. **Socket Simulator** - Send test socket events with JSON editor
4. **Mock Data Editor** - Edit theme colors, navigation items, user session, permissions

### Triggers
- **Keyboard shortcut:** `Ctrl+Shift+D` (or `Cmd+Shift+D` on Mac)
- **Floating button:** Gear icon in bottom-right corner
- **Console API:** `window.gxDevTools.open()` / `.close()` / `.toggle()`

### Files Created
```
runtime/dev-tools/
├── DevToolsModal.vue      # Main modal with tabs
├── StoreInspector.vue     # Store state viewer/editor
├── LayoutSwitcher.vue     # Layout toggle
├── SocketSimulator.vue    # Socket event sender
├── MockDataEditor.vue     # Theme/nav/permissions editor
└── index.js               # Exports
```

### Completed Tasks
- [x] Create DevToolsModal.vue with tabbed interface
- [x] Implement StoreInspector with collapsible sections
- [x] Implement LayoutSwitcher
- [x] Implement SocketSimulator with event log
- [x] Implement MockDataEditor
- [x] Add keyboard shortcut handling
- [x] Add console command API
- [x] Add floating trigger button
- [x] Integrate into PortalContainer.vue
- [x] Document in CLAUDE.md

---

## Phase 5: Cleanup & Polish ✅ COMPLETED

### Completed Tasks
- [x] Update CLAUDE.md with new structure and dev tools docs
- [x] Update template/README.md with gxtk commands
- [x] Rename CLI from `gxto` to `gxtk`
- [x] Update all code references and documentation
- [x] Add .gitignore template file
- [x] Fix init command paths for new folder structure

---

## Summary of Changes

### CLI Command Rename
- Old: `gxto`
- New: `gxtk`

### Key Architecture Changes
1. **Monolithic CLI** → **Modular structure** in `bin/lib/`
2. **Mixed config/** → **Separate template/ and runtime/ directories**
3. **Exposed PortalContainer** → **Hidden in runtime/, accessed via @gx-runtime alias**
4. **No dev tools** → **Full dev tools modal with 4 panels**

### Vite Aliases (in projects)
- `@` → Project's `src/` directory
- `@layouts` → Project's `theme-layouts/` directory
- `@gx-runtime` → Toolkit's `runtime/` directory (from node_modules)
