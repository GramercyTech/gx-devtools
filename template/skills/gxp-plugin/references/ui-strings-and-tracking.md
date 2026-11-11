# UI strings, images and analytics

Load this when writing templates: every visible string, image, and meaningful interaction.

**Rule: every string literal a user sees in the UI must use `gxp-string`.** This is not optional. Button labels, headings, paragraph copy, tab names, empty-state messages, placeholder text, error strings, tooltip text — all of it. The only exceptions are text rendered directly from an API response and purely internal/debug strings. The fallback text inside the element is the default value and is never wasted.

```html
<!-- Heading -->
<h1 gxp-string="welcome_title">Welcome</h1>

<!-- Button label — the fallback is the default label -->
<button><span gxp-string="start_button">Get Started</span></button>

<!-- Paragraph / body copy -->
<p gxp-string="intro_text">Complete the form below to register.</p>

<!-- Empty-state message -->
<p gxp-string="no_results_text">No results found.</p>

<!-- Text from settings (pluginVars) -->
<span gxp-string="company_name" gxp-settings>Company</span>

<!-- Images from assets -->
<img gxp-src="hero_image" src="/placeholder.jpg" alt="Hero" />
```

Strings that do NOT need `gxp-string`: values interpolated from API data (`{{ post.title }}`), v-for loop variables, computed display values derived from store state.

## Analytics tracking (`gxp-track`)

The platform provides a `gxp-track` directive and `window.gxp.track()` for analytics reporting. Add tracking to meaningful interactions — primary buttons, form submits, navigation, feature entry points:

```html
<!-- Click tracking: sends an "interaction" event named by the attribute -->
<button gxp-track="checkin.submit" gxp-string="btn_submit">Check In</button>

<!-- Extra properties as JSON — put record IDs here, not in the event name -->
<button
	gxp-track="session.join"
	:gxp-track-props="JSON.stringify({ session_id: session.id })"
	gxp-string="btn_join"
>
	Join
</button>
```

```javascript
// Non-click milestones from script code — prefer the injected function
const track = inject("gxpTrack")
track("checkin.completed", { attendee_id: attendee.id })

// Or from any JS context
window.gxp.track("registration.started", { form_id: 123 })
```

Rules:

- Event names are namespaced `feature.action` (lowercase, dot-separated) and low-cardinality — IDs and variable data go in `gxp-track-props` / the properties object.
- `gxp-track` composes with `gxp-string` / `gxp-src` on the same element.
- Every tracked event must be declared in `app-manifest.json` → `track-events` (the platform uses it for reporting). The extractor in Step 5 seeds it; refine prop types to allowed-value lists or `{ type, value }` relationship objects where applicable.
- Don't build your own analytics transport (`fetch`, `axios`, custom endpoints). The directive handles delivery — in production it reports to the platform tracking endpoint; on the dev server events are broadcast on `window` as `gxp:track` CustomEvents and logged to the console as JSON, so you can verify payloads without touching production analytics.

**Extraction limit:** `config_extract_strings` only detects `gxp-track` attributes and `gxp.track("literal")` / `gxpTrack("literal")` calls. Events sent through a wrapper (`emit(name)`, `send(name, props)`, a player tracker) are not extracted. Declare those in `track-events` by hand. See `video-playback.md`.

## Component kit

Use `@gxp-dev/app-ui` for all UI components. Run `gxdev storybook` to browse available components and their stories at `http://localhost:6006`. When storybook is running, the `gxp-app-ui-storybook` MCP server (registered in `.mcp.json`) provides tools to inspect stories, documentation, and run story tests directly from your AI assistant.

Key components: `GxButton`, `GxCard`, `GxInput`, `GxModal`, `GxSpinner`, `GxAlert`, `GxBadge`, `GxAvatar`, `GxProgress`, `GxTabs`, `GxAccordion`
