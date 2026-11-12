# Form / quiz / survey apps — `formTemplate`

Load this when the plugin uses any form, quiz or survey operation.

`formTemplate` appears in **two** places and they mean **two different things**. Read this section carefully — treat the manifest flag and the configuration array as independent decisions.

## The two keys

**1. `app-manifest.json` → `"formTemplate": true` — the capability flag.**

Set this any time the plugin calls the platform's form/quiz/survey API — creating a form, reading responses, submitting answers, listing questions. It tells the platform "this plugin owns or consumes a form resource" and opts the install into form-specific behavior (question editor in the admin UI, response viewer, auto-provisioned `ProjectForm`, etc.). **Required** whenever you're using form/quiz operationIds, regardless of whether you ship prepopulated questions.

**2. `configuration.json` → `"formTemplate": [ ...cards ]` — the prepopulated questions.**

A starter question set the platform seeds into the auto-provisioned form at install time, so the admin doesn't start from an empty form. Structured identically to `additionalTabs`: an array of cards (usually `fields_list`) whose `fieldsList` items are the questions. **Optional** — only set it when you actually want to ship starter content. If omitted, the platform provisions an empty form and the admin builds it from scratch.

## The rule

| Scenario                                                    | Manifest `formTemplate`                                        | Configuration `formTemplate` |
| ----------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------- |
| Plugin calls form/quiz API, ships no starter questions      | **`true`** (required)                                          | omit / leave empty           |
| Plugin calls form/quiz API, ships starter questions         | **`true`** (required)                                          | `[ ...cards ]`               |
| Plugin does **not** touch the form/quiz API                 | omit / `false`                                                 | must not be set              |
| You want starter questions but didn't set the manifest flag | — fix this — the array is dead content unless the flag is true | —                            |

Short version:

- **Uses form/quiz API → manifest `formTemplate: true`.** Non-negotiable.
- **Wants to prepopulate questions → configuration `formTemplate: [...]`.** Optional payload.

## How the pieces connect at runtime

1. At install time the platform sees `formTemplate: true` in the manifest and auto-provisions a `ProjectForm` for this plugin install.
2. If `configuration.json` includes a `formTemplate` array, the platform seeds the new `ProjectForm` with those questions. If not, it creates an empty form.
3. The plugin code still declares whichever form/quiz dependencies it needs in `app-manifest.json` (e.g. `quiz_form`, `response_stream`) and calls `store.callApi("forms.show", "quiz_form")` / `store.callApi("form_responses.store", "quiz_form", {...})` etc. Discover the right operationIds via the MCP (`search_api_endpoints quiz`, `api_list_operation_ids --tag Forms`).
4. The admin can edit, add, or remove questions on the auto-provisioned form after install. Your `formTemplate` array is a starting point, not a lock — the admin owns the form once it's provisioned.

So: the manifest flag wires up the form backing store; the configuration array pre-seeds its contents; the dependency bindings scope which form the plugin talks to at runtime. Three independent concerns, all of which you need for a proper form app.

## Minimal example — form app with starter questions

```json
// app-manifest.json
{
	"name": "welcome-quiz",
	"version": "0.1.0",
	"formTemplate": true,
	"settings": {},
	"strings": { "default": { "title": "Welcome Quiz" } },
	"assets": {},
	"dependencies": [{ "identifier": "quiz_form", "model": "ProjectForm" }],
	"permissions": [
		{
			"identifier": "quiz_form",
			"description": "The quiz form — read questions and submit responses"
		}
	]
}
```

```json
// configuration.json
{
	"additionalTabs": [
		/* admin-facing plugin config goes here as always */
	],
	"formTemplate": [
		{
			"type": "fields_list",
			"title": "About You",
			"fieldsList": [
				{ "type": "text", "name": "full_name", "label": "Full name" },
				{
					"type": "radio",
					"name": "experience",
					"label": "Experience level",
					"options": [
						{ "label": "Beginner", "value": "beginner" },
						{ "label": "Advanced", "value": "advanced" }
					]
				}
			]
		}
	]
}
```

## Building `formTemplate` with the MCP

Use the same `config_*` tools you'd use for `additionalTabs`, pointed at the `/formTemplate` root:

- `config_add_card` with `parent_path: "/formTemplate"` — the array is auto-initialized on first add, no seed step needed.
- `config_add_card` with `parent_path: "/formTemplate/0/cards"` — nest sub-cards if you need a `card_list` grouping.
- `config_add_field` with `card_path: "/formTemplate/0"` — add questions to a section.
- `config_list_cards` — lists cards from both `/additionalTabs` and `/formTemplate` with their JSON pointers.

Use the same field types as any other form (`text`, `textarea`, `number`, `radio`, `checkbox`, `select`, `asyncSelect`, `selectAsset`, etc.). Question names live under `fieldsList[].name` — these become the response keys the platform stores.

## Don't confuse `formTemplate` with `additionalTabs`

- `additionalTabs` — **admin** configuration form (every plugin has this). The person installing the plugin fills this in once.
- `formTemplate` — **end-user** form questions (only form apps). Admins may tweak these before publishing; end users (attendees, staff) answer them at runtime.

Strings, assets, dependencies, colors → `additionalTabs`. Quiz/survey questions that end users will answer → `formTemplate`.

Finish with `gxdev lint --all`. The linter validates both roots against the same card/field schema, so malformed questions fail in the same way malformed admin fields do.
