import { serviceManager, ServiceConfig } from './ServiceManager.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

export interface SocketOptions {
  cwd?: string;
}

export interface SocketEvent {
  name: string;
  event: string;
  channel: string;
  data: Record<string, unknown>;
}

// Get toolkit root
function getToolkitRoot(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // From dist/tui/services/ go up 3 levels to toolkit root
  return path.resolve(__dirname, '..', '..', '..');
}

// Get the path to the runtime server.js
function getServerPath(): string {
  const toolkitRoot = getToolkitRoot();
  return path.join(toolkitRoot, 'runtime', 'server.js');
}

// Get the socket events directory
function getSocketEventsDir(cwd: string): string | null {
  // Check local project first
  const localDir = path.join(cwd, 'socket-events');
  if (fs.existsSync(localDir)) {
    return localDir;
  }

  // Fall back to toolkit's socket-events
  const toolkitDir = path.join(getToolkitRoot(), 'socket-events');
  if (fs.existsSync(toolkitDir)) {
    return toolkitDir;
  }

  return null;
}

export function startSocket(options: SocketOptions = {}): void {
  const cwd = options.cwd || process.cwd();

  const config: ServiceConfig = {
    id: 'socket',
    name: 'Socket.IO',
    command: 'node',
    args: [getServerPath()],
    cwd,
    env: {
      FORCE_COLOR: '1',
    },
  };

  serviceManager.start(config);
}

export function stopSocket(): boolean {
  return serviceManager.stop('socket');
}

export function isSocketRunning(): boolean {
  return serviceManager.isRunning('socket');
}

// List available socket events
export function listSocketEvents(cwd?: string): SocketEvent[] {
  const eventsDir = getSocketEventsDir(cwd || process.cwd());
  if (!eventsDir) {
    return [];
  }

  const events: SocketEvent[] = [];
  const files = fs.readdirSync(eventsDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(eventsDir, file), 'utf-8');
      const data = JSON.parse(content);
      events.push({
        name: path.basename(file, '.json'),
        event: data.event,
        channel: data.channel,
        data: data.data,
      });
    } catch {
      // Skip invalid files
    }
  }

  return events;
}

// Send a socket event
export async function sendSocketEvent(
  eventName: string,
  identifier?: string,
  cwd?: string
): Promise<{ success: boolean; message: string }> {
  const eventsDir = getSocketEventsDir(cwd || process.cwd());
  if (!eventsDir) {
    return { success: false, message: 'Socket events directory not found' };
  }

  const eventPath = path.join(eventsDir, `${eventName}.json`);
  if (!fs.existsSync(eventPath)) {
    return { success: false, message: `Event "${eventName}" not found` };
  }

  try {
    const content = fs.readFileSync(eventPath, 'utf-8');
    const eventData = JSON.parse(content);

    // Update channel if identifier provided
    if (identifier) {
      const channelParts = eventData.channel.split('.');
      if (channelParts.length >= 2) {
        const model = channelParts[1];
        eventData.channel = `private.${model}.${identifier}`;
      }
    }

    const socketPort = process.env.SOCKET_IO_PORT || 3069;
    const payload = JSON.stringify({
      event: eventData.event,
      channel: eventData.channel,
      data: eventData.data,
    });

    return new Promise((resolve) => {
      // Try HTTPS first, then HTTP
      const tryRequest = (useHttps: boolean) => {
        const protocol = useHttps ? https : http;
        const url = `${useHttps ? 'https' : 'http'}://localhost:${socketPort}/emit`;

        const req = protocol.request(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            },
            rejectUnauthorized: false, // Allow self-signed certs
          },
          (res) => {
            if (res.statusCode === 200) {
              resolve({
                success: true,
                message: `Sent "${eventData.event}" to channel "${eventData.channel}"`,
              });
            } else {
              resolve({
                success: false,
                message: `Server returned status ${res.statusCode}`,
              });
            }
          }
        );

        req.on('error', (err) => {
          if (useHttps && err.message.includes('ECONNREFUSED')) {
            // Try HTTP if HTTPS fails
            tryRequest(false);
          } else {
            resolve({
              success: false,
              message: err.message.includes('ECONNREFUSED')
                ? 'Socket.IO server not running. Start it with /socket'
                : `Error: ${err.message}`,
            });
          }
        });

        req.write(payload);
        req.end();
      };

      tryRequest(true);
    });
  } catch (err) {
    return {
      success: false,
      message: `Error reading event file: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}
