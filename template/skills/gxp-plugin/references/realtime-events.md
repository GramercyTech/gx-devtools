# Real-time events

Load this when subscribing to events, broadcasting between plugin users, or replacing polling.

Every plugin has two streams of real-time events, both surfaced through the store:

1. **The `primary` channel** — a peer channel scoped to users of this plugin right now. Use it for in-app pub/sub (cursor positions, "someone just did X", remote controls).
2. **Platform API events** — defined in AsyncAPI at `${apiDocsBaseUrl}/api-specs/asyncapi.json` under `components.messages`. Each message can declare `x-triggered-by` pointing at an OpenAPI operationId. When the server handles that operation, the event fires — you subscribe instead of polling.

## The `primary` channel

```javascript
// Listen for a custom event from other users of this plugin
const stopPeer = store.sockets.primary.listenForWhisper(
	"cursor_moved",
	(data) => {
		console.log("Peer moved:", data)
	},
)

// Broadcast to everyone else on the primary channel
store.sockets.primary.broadcast("cursor_moved", { x: 42, y: 100 })
```

## Platform API events

Declare the event in the correct manifest dependency using its AsyncAPI model/channel metadata. Once the admin binds that dependency and its listener is initialized, subscribe through its exact declared event key:

```javascript
const stopEvent = store.sockets[identifier][eventKey].listen((post) => {
	console.log("New post on the destination stream:", post)
})
```

`identifier` is the declared dependency identifier and `eventKey` is an exact key in that dependency’s `events` map. The wrapper selects the authorized bound model channel and server event. Missing bindings or listeners are unresolved configuration, not permission to use the primary/project channel instead. Call `stopPeer()` / `stopEvent()` when context changes or the component unmounts.

For an initialized named socket use `store.listen(socketName, eventName, callback)` and its returned unsubscribe closure. A dependency identifier is not an arbitrary socket name. The event-first overload taking a permission identifier is development-only; do not ship code that depends on it. Discover the exact deployed contract with `describe_store_api`.

## Rule: whenever you add a `callApi`, check for a matching event

Before wiring polling or manual refresh after a mutation, ask: does this operation fire a socket event? Use the MCP:

- `api_find_events_for_operation` — given an operationId, returns every AsyncAPI message whose `x-triggered-by` matches. If it returns one, subscribe to it instead of polling.
- `api_list_events` — list every event, optionally filtered by `triggeredBy`.
- `search_websocket_events` — keyword search across events + channels.

Example: you just added `store.callApi("posts.store", "social_stream_two", {...})`. Run `api_find_events_for_operation({ operationId: "posts.store" })`, see `SocialStreamPostCreated`, declare the returned event under the correct bound dependency, then use `store.sockets[identifier][eventKey].listen(cb)`. Verify its authorized channel; do not substitute the primary channel. No polling.

## Testing broadcasts locally

```bash
gxdev socket list                      # list available events
gxdev socket send --event EventName    # fire a test broadcast
```

Payloads live under `socket-events/` — add or edit a JSON file to define a new one.
