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

## List endpoints: paginate and request only what you need

`store.callApi` does **not** paginate. A list call returns one page of the server's paginated envelope, and that's all:

```json
{
	"data": [ … ],
	"meta": { "current_page": 1, "last_page": 7, "per_page": 20, "total": 131, "from": 1, "to": 20 },
	"links": { "first": "…", "last": "…", "prev": null, "next": "…" }
}
```

Index operations take `page`, `limit`, `sort`, `include` and endpoint-specific `filter[field]` query parameters. Confirm each operation's parameters and caps with `get_endpoint_details` / `api_get_operation_parameters`. Standard Orion routes default to **100** records per page with a maximum of **1,000**. Some lower that (social stream posts: 200), and custom routes set their own (scoped posts: 25 per page, at most 100). On Orion routes a `limit` above the cap is **rejected with a 422** ("Pagination limit of N is exceeded"), not clamped. A missing, zero or negative `limit` falls back to the default. Search operations (POST) read `limit` and `page` from the body, which is where `callApi` puts POST data.

```javascript
const PAGE_SIZE = 20 // what the screen shows, not "everything"

/** One page. GET data becomes query parameters. */
async function fetchPostsPage(page = 1) {
	const result = await store.callApi(
		"social-streams.posts.index",
		"social_stream",
		{
			page,
			limit: PAGE_SIZE,
			sort: "-created_at",
			include: "attendee", // comma-separated string; omit relations you don't render
		},
	)
	return {
		items: result.data,
		page: result.meta.current_page,
		lastPage: result.meta.last_page,
	}
}

// "Load more": only when the user scrolls or taps
const posts = ref([])
let nextPage = 1
let lastPage = Infinity
async function loadMore() {
	if (nextPage > lastPage) return
	const { items, page, lastPage: last } = await fetchPostsPage(nextPage)
	posts.value.push(...items)
	nextPage = page + 1
	lastPage = last
}

// Search operations take everything in the body; includes is an array of objects
async function searchApprovedPosts(page = 1) {
	return store.callApi("social-streams.posts.search", "social_stream", {
		filters: [{ field: "is_approved", operator: "=", value: true }],
		sort: [{ field: "created_at", direction: "desc" }],
		includes: [{ relation: "attendee" }],
		limit: PAGE_SIZE,
		page,
	})
}

// A count: one row, read meta.total
async function countPosts() {
	const result = await store.callApi(
		"social-streams.posts.index",
		"social_stream",
		{ limit: 1 },
	)
	return result.meta.total
}
```

Rules:

- **Always set `limit`** to what you display, and keep it under the endpoint's cap. Omitting it fetches up to the endpoint default (often 100) every call. Exceeding the cap fails with a 422.
- **Never fetch every page by default.** If a feature truly needs all records (e.g. an export), confirm with the user, use the largest sensible page size, fetch pages sequentially (not in parallel), and stop at a hard cap.
- **Filter and sort on the server.** Use `sort`, the endpoint's `filter[...]` parameters or its search operation, not client-side filtering of a full download.
- **`include` only what you render.** On index operations, pass a comma-separated string (`"attendee,projectTags"`). The published spec types it as an array, but the server splits a string, and an array (`include[]=…`) makes the request fail. Search operations take `includes: [{ relation: "attendee" }]` in the body instead.
- **Counts:** `limit: 1` and `meta.total`. Validate it with `Number.isSafeInteger(total) && total >= 0`.
- **Stop condition:** there are more pages while `meta.current_page < meta.last_page`. Append each page, don't replace. Custom routes may not return `meta`, so check `get_endpoint_details`.
- **No polling.** Index operations have no events of their own. Declare the resource's events on the dependency (e.g. `"created": "SocialStreamPostCreated"`) and listen via `store.sockets[identifier][eventKey].listen(...)`. On an event, insert the payload if it holds the record, or refetch **page 1 only** and merge by `id`. Debounce bursts, and never reload every loaded page or re-fetch on a timer.
- **A 422** on a list call means the request is wrong (e.g. `limit` over the cap). Fix it, don't retry.
- **Cache within the view.** Don't refetch the same page on every render, tab switch or prop change. Fetch on mount and on events.
- **Response fields:** a dependency's `visibleFields` trims fields only for attendee and social stream post responses today. Other endpoints return their full resource. Don't rely on it to shrink payloads, and never treat hiding data in the UI as redaction.
- **The local mock API** may ignore `limit`/`page`. Verify pagination against a real environment (`VITE_API_ENV=develop`).

## Legacy endpoint helpers

Existing plugins may contain low-level store helpers. Preserve their supported behavior when maintaining an existing plugin, but use declared `callApi` bindings for new platform access. Do not treat an authorization failure as permission to fall back to a raw endpoint. Discover the exact operation ID, parameter schema and required grants with the installed tools; older examples are not proof that an operation is available.

## When `api_generate_dependency` refuses

`api_generate_dependency` deliberately refuses when the platform's OpenAPI spec lacks complete `x-permission` / `x-relation` metadata. It won't guess a permission binding. Don't work around that by inventing paths. Build the entry by hand from facts you've confirmed with `get_endpoint_details`:

- Bind the **parent** resource the admin picks (e.g. `SocialStream`), with `permissionKey` set to that parent's key.
- List every permission the operations need in `permissions`.
- Copy each operation's `method:path` exactly from the spec.
- Add an `asyncSelect` field for `dependency_list.<identifier>`, using the parent's dashboard index route as its picker.

Known gaps today: all `SocialStreamPost`, post asset, scoped-post and like operations are refused. The like toggle/index paths are also malformed in the spec (`/v1/projects/{social_stream}/{post}/…`, EZ-3407), so don't ship them. A working social stream entry:

```json
{
	"identifier": "social_stream",
	"model": "SocialStream",
	"permissionKey": "social_stream",
	"permissions": [
		"view_social_streams",
		"view_social_stream_posts",
		"create_social_stream_posts"
	],
	"operations": {
		"social-streams.show": "get:/v1/projects/{teamSlug}/{projectSlug}/social-streams/{social_stream}",
		"social-streams.posts.index": "get:/v1/projects/{teamSlug}/{projectSlug}/social-streams/{social_stream}/posts",
		"social-streams.posts.show": "get:/v1/projects/{teamSlug}/{projectSlug}/social-streams/{social_stream}/posts/{post}",
		"social-streams.posts.store": "post:/v1/projects/{teamSlug}/{projectSlug}/social-streams/{social_stream}/posts"
	}
}
```

```json
{
	"type": "asyncSelect",
	"name": "dependency_list.social_stream",
	"label": "Social stream",
	"route": "dashboard.project.social-streams.index",
	"valueField": "id",
	"labelField": "name",
	"required": true
}
```

Run `gxdev lint --all` after adding them.
