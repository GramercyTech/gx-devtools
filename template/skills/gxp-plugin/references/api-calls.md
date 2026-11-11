# API calls — `store.callApi`

Load this when adding or changing any platform API call.

**Every call to the GxP platform goes through `store.callApi`.** It handles authorization, URL resolution, team/project scoping, and path-parameter substitution. You only provide three things:

```javascript
await store.callApi(operationId, identifier, data)
```

| Argument      | Purpose                                                                                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operationId` | The OpenAPI operationId for the call. Look it up with `api_list_operation_ids` or `search_api_endpoints` (MCP). Never invent one.                                                                                                 |
| `identifier`  | A **permission identifier** declared in `app-manifest.json` → `dependencies` / `permissions`. Determines which resource's permissions the call runs under, and supplies the parent object ID that gets substituted into the path. |
| `data`        | Additional params — body fields, query params, or path params not covered by the identifier. Pass `"pluginVars.someKey"` as a value to pull from settings at call time.                                                           |

Generated platform calls must use declared `callApi` operation bindings. Do not replace a missing or denied binding with `apiGet`/`apiPost`/`apiPut`/`apiDelete`, and never use axios/fetch directly. Legacy helpers do not grant permissions or bypass server-side authorization. `apiPatch(endpoint, data)` is a supported legacy platform helper. Preserve existing authorized uses, but use declared `callApi` bindings for new generated platform calls.

## Permission identifiers

Each identifier is declared in `app-manifest.json` and later bound by an admin to a specific resource + permission scope (read, create, update, delete). Pick identifiers that describe the **role the resource plays in the plugin**, not its name.

Example — a plugin that reads posts from one social stream and creates posts on another:

```json
// app-manifest.json
{
	"dependencies": [
		{ "identifier": "social_stream_one", "model": "SocialStream" },
		{ "identifier": "social_stream_two", "model": "SocialStream" }
	],
	"permissions": [
		{
			"identifier": "social_stream_one",
			"description": "Source stream — read posts"
		},
		{
			"identifier": "social_stream_two",
			"description": "Destination stream — create posts"
		}
	]
}
```

```javascript
// Read posts from the source stream
const posts = await store.callApi("posts.index", "social_stream_one")

// Create a post on the destination stream
await store.callApi("posts.store", "social_stream_two", {
	body: "Hello world",
	image_url: imageUrl,
})
```

The admin assigns `social_stream_one` read-only access to stream A and `social_stream_two` create access to stream B. The plugin code never hard-codes IDs.

## The `project` identifier — project-wide, top-level operations

When you need to create the parent resource itself (e.g. the social stream), or hit any endpoint scoped at the project level rather than to a specific dependency, use the reserved identifier `"project"`. The identifier selects project context; it does not grant project-wide permission. Declare the required operation binding and permissions, confirm the current caller is authorized, and pass any path params the endpoint needs in `data`.

```javascript
// Create a new social stream under the project
const stream = await store.callApi("social_streams.store", "project", {
	name: "New Stream",
})

// Create a post directly against a known socialStreamId (no dependency binding)
await store.callApi("posts.store", "project", {
	socialStreamId: stream.id,
	body: "First post",
})
```

Rule of thumb:

- Operating on a resource the admin will bind later → declare a dependency identifier and pass it.
- Creating the parent resource itself, or acting across the whole project → use `"project"` and pass the relevant IDs in `data`.

## Legacy endpoint helpers

Existing plugins may contain low-level store helpers. Preserve their supported behavior when maintaining an existing plugin, but use declared `callApi` bindings for new platform access. Do not treat an authorization failure as permission to fall back to a raw endpoint. Discover the exact operation ID, parameter schema and required grants with the installed tools; older examples are not proof that an operation is available.
