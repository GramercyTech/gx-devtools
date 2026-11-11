# Store data access

Quick reference. The authoritative, deployed contract is the MCP tool `describe_store_api` — call it when in doubt.

```javascript
// Getters
store.getString("key", "default") // stringsList[key] or default
store.getSetting("key", "default") // pluginVars[key] or default
store.getAsset("key", "/fallback.jpg") // assetList[key] or default
store.getState("key", null) // triggerState[key] or default
store.hasPermission("flag") // boolean
store.findDependency("identifier") // bound resource ID for an identifier

// Write to triggerState (the only section plugins should write to)
store.triggerState["my_key"] = "value"
// Do NOT write to pluginVars, stringsList, or assetList — platform-managed
```

## Logged-in user

```javascript
const user = store.auth?.user // Attendee object, or `null` if logged out — same in dev and production
store.getGroupSlugs() // ["speakers", "vip"] — portal-visible groups
store.inGroup("vip") / store.inAnyGroup(["staff", "speakers"]) // boolean

// DEV-ONLY (not on the platform — do not ship code that calls these):
// store.user, store.getUser(), store.getUserName(), store.getUserEmail(), store.isAuthenticated()
```

`store.auth?.user` is null when no attendee is authenticated; always guard before dereferencing. In `gxdev dev` a dummy authenticated attendee may be provided; production supplies the authenticated attendee.
