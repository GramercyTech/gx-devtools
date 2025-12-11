---
sidebar_position: 12
title: Socket.IO Events
description: Real-time communication with Socket.IO for plugin development
---

# Socket.IO Events

The GxP Toolkit includes a Socket.IO server for simulating real-time events during development. This allows you to test how your plugin responds to events from the platform without connecting to production systems.

## Overview

The Socket.IO system consists of:

1. **Socket.IO Server** - Node.js server that broadcasts events
2. **Event Templates** - JSON files defining event structure
3. **Store Integration** - Methods to listen and emit events
4. **CLI Tools** - Commands to list and send events

## Quick Start

### Start the Socket Server

```bash
# Start with development server
gxdev dev --with-socket

# Or start standalone
gxdev socket
```

The server runs on port `3069` by default (configurable via `SOCKET_IO_PORT`).

### Send a Test Event

```bash
# List available events
gxdev socket list

# Send an event
gxdev socket send --event AiSessionMessageCreated
```

### Listen in Your Plugin

```javascript
import { useGxpStore } from '@gx-runtime/stores/gxpPortalConfigStore';

const store = useGxpStore();

// Listen for events on the primary socket
store.listenSocket('primary', 'AiSessionMessageCreated', (data) => {
  console.log('Message received:', data);
});
```

## Socket Server

### Starting the Server

The Socket.IO server can be started in several ways:

```bash
# Via TUI command
/socket

# With Mock API
/socket --with-mock

# Via CLI
gxdev dev --with-socket

# Standalone
node server.js  # (if published to project)
```

### Server Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SOCKET_IO_PORT` | `3069` | Socket server port |
| `USE_HTTPS` | `true` | Use secure WebSocket |
| `CERT_PATH` | | SSL certificate path |
| `KEY_PATH` | | SSL private key path |

### Server Features

- **CORS enabled** - Accepts connections from dev server
- **HTTPS support** - Uses same certificates as dev server
- **Event emit endpoint** - HTTP endpoint for sending events
- **Channel support** - Events sent on specific channels

## Event Templates

### File Location

Event templates are JSON files in the `socket-events/` directory:

```
socket-events/
├── AiSessionMessageCreated.json
├── SocialStreamPostCreated.json
└── SocialStreamPostVariantCompleted.json
```

### Template Structure

```json
{
  "event": "EventName",
  "channel": "private.Model.identifier",
  "data": {
    "id": 123,
    "field1": "value1",
    "field2": "value2",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

| Field | Description |
|-------|-------------|
| `event` | Event name (must match what your code listens for) |
| `channel` | Broadcasting channel (follows pattern) |
| `data` | Event payload (any JSON structure) |

### Channel Format

Channels follow the pattern:
```
private.{Model}.{identifier}
```

Examples:
- `private.AiInterface.ai_interface_background_remover`
- `private.SocialStream.social_stream_main`
- `private.CheckIn.checkin_kiosk_1`

### Example Templates

#### AI Session Message

```json
{
  "event": "AiSessionMessageCreated",
  "channel": "private.AiInterface.ai_interface_background_remover",
  "data": {
    "id": 1234,
    "ai_session_id": 567,
    "message": "Background removal process completed successfully",
    "type": "completion",
    "metadata": {
      "processing_time": 2.3,
      "input_image": "/dev-assets/images/product-placeholder.jpg",
      "output_image": "/dev-assets/images/background-placeholder.jpg",
      "confidence": 0.95
    },
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
}
```

#### Social Stream Post

```json
{
  "event": "SocialStreamPostCreated",
  "channel": "private.SocialStream.social_stream_main",
  "data": {
    "id": 789,
    "social_stream_id": 101,
    "content": "Just arrived at the conference! #TechConf2024",
    "author": {
      "name": "Jane Smith",
      "avatar": "/dev-assets/images/avatar-placeholder.jpg",
      "handle": "@janesmith"
    },
    "media": [],
    "likes": 0,
    "shares": 0,
    "created_at": "2024-01-15T14:22:00Z"
  }
}
```

### Creating Custom Events

1. Create a new JSON file in `socket-events/`:

```json
{
  "event": "AttendeeCheckedIn",
  "channel": "private.CheckIn.checkin_kiosk_lobby",
  "data": {
    "id": 456,
    "attendee_id": 789,
    "attendee_name": "John Doe",
    "badge_number": "A-0042",
    "check_in_time": "2024-01-15T09:15:00Z",
    "kiosk_id": "kiosk_lobby"
  }
}
```

2. Send the event:

```bash
gxdev socket send --event AttendeeCheckedIn
```

## Store Integration

### Primary Socket

The GxP store automatically connects to the Socket.IO server:

```javascript
import { useGxpStore } from '@gx-runtime/stores/gxpPortalConfigStore';

const store = useGxpStore();
```

### Listening for Events

#### Basic Listener

```javascript
// Listen on primary socket
store.listenSocket('primary', 'EventName', (data) => {
  console.log('Event received:', data);
});
```

#### With Dependency

For events tied to specific dependencies:

```javascript
// Listen for dependency-specific events
store.useSocketListener('badge-printer', 'print-complete', (result) => {
  if (result.success) {
    console.log('Badge printed!');
  }
});
```

### Emitting Events

Send events from your plugin:

```javascript
// Emit on primary socket
store.emitSocket('primary', 'user-action', {
  action: 'button_click',
  button_id: 'checkin-submit',
  timestamp: new Date().toISOString()
});
```

### State Change Listener

Listen for state change broadcasts:

```javascript
const socket = store.sockets.primary;
socket.listenForStateChange((newState) => {
  console.log('State changed:', newState);
  store.updateState('remote_value', newState.value);
});
```

## Dependency-Based Sockets

Configure dependencies in your manifest to set up automatic socket listeners:

```json
{
  "dependencies": [
    {
      "identifier": "badge_printer_1",
      "model": "BadgePrinter",
      "events": {
        "created": "BadgePrintJobCreated",
        "updated": "BadgePrintJobUpdated",
        "completed": "BadgePrintJobCompleted"
      }
    }
  ]
}
```

The store automatically sets up listeners:

```javascript
// Listeners are created automatically
store.sockets['badge_printer_1'].created.listen((data) => {
  console.log('Print job created:', data);
});

store.sockets['badge_printer_1'].completed.listen((data) => {
  console.log('Print job done:', data);
});
```

## CLI Commands

### List Events

```bash
gxdev socket list
```

Output:
```
📡 Available socket events:

🎯 AiSessionMessageCreated
   Event: AiSessionMessageCreated
   Channel: private.AiInterface.ai_interface_background_remover

🎯 SocialStreamPostCreated
   Event: SocialStreamPostCreated
   Channel: private.SocialStream.social_stream_main

💡 Usage:
   gxdev socket send --event AiSessionMessageCreated
   gxdev socket send --event SocialStreamPostCreated --identifier social_stream
```

### Send Event

```bash
# Basic send
gxdev socket send --event EventName

# With custom identifier (updates channel)
gxdev socket send --event AttendeeCheckedIn --identifier kiosk_2
```

The `--identifier` flag updates the channel:
- Original: `private.CheckIn.checkin_kiosk_lobby`
- With `--identifier kiosk_2`: `private.CheckIn.kiosk_2`

## TUI Commands

In the interactive TUI:

```bash
# Start socket server
/socket

# With mock API
/socket --with-mock

# List events
/socket list

# Send event
/socket send AiSessionMessageCreated

# Send with identifier
/socket send AttendeeCheckedIn kiosk_2
```

## In-Browser Dev Tools

The Dev Tools (`Ctrl+Shift+D`) include a Socket Simulator:

1. Open Dev Tools → **Socket Simulator** tab
2. Select an event from the dropdown
3. Modify the JSON payload if needed
4. Click **Send** to emit the event

The simulator:
- Shows all available events
- Allows payload editing
- Shows send confirmation
- Displays any errors

## Mock API Server

Start with mock API for HTTP endpoint simulation:

```bash
gxdev dev --with-socket --with-mock
# or
/socket --with-mock
```

The mock API provides:
- `/mock-api/*` endpoints
- Automatic response generation
- Request logging

## Real-World Usage Patterns

### Check-In Flow

```javascript
// Setup: Listen for check-in events
onMounted(() => {
  store.listenSocket('primary', 'AttendeeCheckedIn', handleCheckIn);
});

function handleCheckIn(data) {
  // Update UI with check-in data
  store.updateState('last_checkin', data);

  // Trigger badge print
  store.emitSocket('primary', 'PrintBadge', {
    attendee_id: data.attendee_id,
    badge_number: data.badge_number
  });
}
```

### Social Wall

```javascript
const posts = ref([]);

onMounted(() => {
  // Listen for new posts
  store.listenSocket('primary', 'SocialStreamPostCreated', (post) => {
    posts.value.unshift(post);
  });

  // Listen for post updates (likes, shares)
  store.listenSocket('primary', 'SocialStreamPostUpdated', (update) => {
    const idx = posts.value.findIndex(p => p.id === update.id);
    if (idx >= 0) {
      posts.value[idx] = { ...posts.value[idx], ...update };
    }
  });
});
```

### AI Processing

```javascript
const processing = ref(false);
const result = ref(null);

async function startAiProcessing(imageUrl) {
  processing.value = true;

  // Request processing
  await store.apiPost('/ai/process', { image: imageUrl });

  // Listen for completion
  store.listenSocket('primary', 'AiSessionMessageCreated', (data) => {
    if (data.type === 'completion') {
      processing.value = false;
      result.value = data;
    }
  });
}
```

## Troubleshooting

### Socket not connecting

```
Error: Cannot connect to Socket.IO server
```

Solutions:
1. Ensure server is running (`gxdev dev --with-socket`)
2. Check port isn't blocked (`SOCKET_IO_PORT`)
3. Verify HTTPS certificates are valid

### Events not received

1. Check event name matches exactly (case-sensitive)
2. Verify channel matches dependency configuration
3. Look for connection errors in browser console

### Event file not found

```
Error: Event file not found: MyEvent.json
```

Solutions:
1. Check file exists in `socket-events/`
2. Verify filename matches event name
3. Check JSON syntax is valid

### CORS errors

If you see CORS errors:
1. Ensure dev server and socket server use same protocol (both HTTP or both HTTPS)
2. Check socket server port is correct in environment

## Server Customization

Publish the server for customization:

```bash
gxdev publish server.js
```

Then modify `server.js` in your project root to:
- Add custom endpoints
- Modify CORS settings
- Add authentication
- Custom event handling

```javascript
// Example: Add custom endpoint
app.post('/custom-emit', (req, res) => {
  const { event, data } = req.body;
  io.emit(event, data);
  res.json({ success: true });
});
```
