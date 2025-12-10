import { spawn, ChildProcess, execSync } from 'child_process';
import { EventEmitter } from 'events';

export type ServiceStatus = 'stopped' | 'starting' | 'running' | 'error';

export interface ServiceConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}

// Store configs for restart capability
const serviceConfigs: Map<string, ServiceConfig> = new Map();

export interface ServiceState {
  id: string;
  name: string;
  status: ServiceStatus;
  logs: string[];
  process?: ChildProcess;
  pid?: number;
  error?: string;
}

export class ServiceManager extends EventEmitter {
  private services: Map<string, ServiceState> = new Map();
  private maxLogLines = 1000;
  private cleanupRegistered = false;

  constructor() {
    super();
    this.registerCleanupHandlers();
  }

  // Register cleanup handlers to kill all services on exit
  private registerCleanupHandlers(): void {
    if (this.cleanupRegistered) return;
    this.cleanupRegistered = true;

    const cleanup = () => {
      this.forceStopAll();
    };

    // Handle various exit scenarios
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGHUP', cleanup);
    process.on('beforeExit', cleanup);

    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
      console.error('Uncaught exception:', err);
      cleanup();
      process.exit(1);
    });
  }

  getService(id: string): ServiceState | undefined {
    return this.services.get(id);
  }

  getAllServices(): ServiceState[] {
    return Array.from(this.services.values());
  }

  isRunning(id: string): boolean {
    const service = this.services.get(id);
    return service?.status === 'running' || service?.status === 'starting';
  }

  start(config: ServiceConfig): ServiceState {
    // Store config for restart capability
    serviceConfigs.set(config.id, config);

    // Check if already running
    const existing = this.services.get(config.id);
    if (existing && (existing.status === 'running' || existing.status === 'starting')) {
      this.addLog(config.id, `[${config.name}] Already running`);
      return existing;
    }

    // Create or reset service state
    const state: ServiceState = {
      id: config.id,
      name: config.name,
      status: 'starting',
      logs: existing?.logs || [],
    };
    this.services.set(config.id, state);

    this.addLog(config.id, `[${config.name}] Starting...`);
    this.emit('statusChange', config.id, 'starting');

    try {
      // Spawn the process with environment variables to prevent stdin access
      // CI=true disables interactive prompts in many tools
      // These prevent child processes from trying to use raw stdin mode
      // detached: true creates a new process group that doesn't share the parent's tty
      const proc = spawn(config.command, config.args, {
        cwd: config.cwd,
        env: {
          ...process.env,
          ...config.env,
          FORCE_COLOR: '1',
          CI: 'true',
        },
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      });

      state.process = proc;
      state.pid = proc.pid;

      // Handle stdout
      proc.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          this.addLog(config.id, line);
        });

        // Detect when service is ready
        const output = data.toString();
        if (state.status === 'starting') {
          // Vite ready indicators
          if (output.includes('ready in') || output.includes('Local:') || output.includes('VITE')) {
            state.status = 'running';
            this.emit('statusChange', config.id, 'running');
          }
          // Socket.IO ready indicator
          if (output.includes('Socket.IO server') || output.includes('listening on port')) {
            state.status = 'running';
            this.emit('statusChange', config.id, 'running');
          }
        }
      });

      // Handle stderr
      proc.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          this.addLog(config.id, `[stderr] ${line}`);
        });
      });

      // Handle process exit
      proc.on('close', (code) => {
        state.process = undefined;
        if (code === 0 || code === null) {
          state.status = 'stopped';
          this.addLog(config.id, `[${config.name}] Stopped`);
        } else {
          state.status = 'error';
          state.error = `Process exited with code ${code}`;
          this.addLog(config.id, `[${config.name}] Error: exited with code ${code}`);
        }
        this.emit('statusChange', config.id, state.status);
      });

      // Handle spawn errors
      proc.on('error', (err) => {
        state.status = 'error';
        state.error = err.message;
        state.process = undefined;
        this.addLog(config.id, `[${config.name}] Error: ${err.message}`);
        this.emit('statusChange', config.id, 'error');
      });

      // Set running after a short delay if no ready message detected
      setTimeout(() => {
        if (state.status === 'starting' && state.process) {
          state.status = 'running';
          this.emit('statusChange', config.id, 'running');
        }
      }, 3000);

    } catch (err) {
      state.status = 'error';
      state.error = err instanceof Error ? err.message : 'Unknown error';
      this.addLog(config.id, `[${config.name}] Failed to start: ${state.error}`);
      this.emit('statusChange', config.id, 'error');
    }

    return state;
  }

  stop(id: string): boolean {
    const service = this.services.get(id);
    if (!service || !service.process) {
      return false;
    }

    this.addLog(id, `[${service.name}] Stopping...`);

    // Kill the process tree
    try {
      process.kill(-service.process.pid!, 'SIGTERM');
    } catch {
      // Process group kill failed, try direct kill
      service.process.kill('SIGTERM');
    }

    // Force kill after timeout
    setTimeout(() => {
      if (service.process && !service.process.killed) {
        try {
          process.kill(-service.process.pid!, 'SIGKILL');
        } catch {
          service.process.kill('SIGKILL');
        }
      }
    }, 2000);

    return true;
  }

  stopAll(): void {
    for (const [id] of this.services) {
      this.stop(id);
    }
  }

  // Force stop all services synchronously - used during process exit
  forceStopAll(): void {
    for (const [id, service] of this.services) {
      if (service.pid) {
        try {
          // Try to kill the process group first
          process.kill(-service.pid, 'SIGKILL');
        } catch {
          // Process group kill failed, try direct kill
          try {
            process.kill(service.pid, 'SIGKILL');
          } catch {
            // Process may already be dead
          }
        }
      }
      if (service.process && !service.process.killed) {
        try {
          service.process.kill('SIGKILL');
        } catch {
          // Ignore errors
        }
      }
    }

    // Also try to kill any orphaned vite/nodemon processes using lsof on common ports
    try {
      // Kill processes on typical dev ports synchronously
      execSync('lsof -ti :3060 | xargs kill -9 2>/dev/null || true', { stdio: 'ignore' });
      execSync('lsof -ti :3069 | xargs kill -9 2>/dev/null || true', { stdio: 'ignore' });
    } catch {
      // Ignore errors - best effort cleanup
    }
  }

  restart(id: string): boolean {
    const config = serviceConfigs.get(id);
    if (!config) {
      return false;
    }

    const service = this.services.get(id);
    if (service?.process) {
      // Stop first, then restart after process exits
      this.addLog(id, `[${config.name}] Restarting...`);

      const onExit = () => {
        // Small delay to ensure cleanup
        setTimeout(() => {
          this.start(config);
        }, 500);
      };

      // Listen for process exit once
      service.process.once('close', onExit);

      // Kill the process
      try {
        process.kill(-service.process.pid!, 'SIGTERM');
      } catch {
        service.process.kill('SIGTERM');
      }

      // Force kill after timeout
      setTimeout(() => {
        if (service.process && !service.process.killed) {
          try {
            process.kill(-service.process.pid!, 'SIGKILL');
          } catch {
            service.process.kill('SIGKILL');
          }
        }
      }, 2000);
    } else {
      // Not running, just start
      this.start(config);
    }

    return true;
  }

  getConfig(id: string): ServiceConfig | undefined {
    return serviceConfigs.get(id);
  }

  clearLogs(id: string): void {
    const service = this.services.get(id);
    if (service) {
      service.logs = [];
      this.emit('logsCleared', id);
    }
  }

  private addLog(id: string, message: string): void {
    const service = this.services.get(id);
    if (!service) return;

    service.logs.push(message);

    // Trim logs if too many
    if (service.logs.length > this.maxLogLines) {
      service.logs = service.logs.slice(-this.maxLogLines);
    }

    this.emit('log', id, message);
  }
}

// Singleton instance
export const serviceManager = new ServiceManager();
