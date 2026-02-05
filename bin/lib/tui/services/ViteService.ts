import { serviceManager, ServiceConfig } from './ServiceManager.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

export interface ViteOptions {
  noHttps?: boolean;
  cwd?: string;
}

// Get the toolkit root directory
function getToolkitRoot(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // Navigate from dist/tui/services to project root (3 levels up)
  return path.resolve(__dirname, '..', '..', '..');
}

// Find existing SSL certificates in a directory
function findExistingCertificates(certsDir: string): { certPath: string; keyPath: string } | null {
  if (!fs.existsSync(certsDir)) return null;

  const files = fs.readdirSync(certsDir);
  const certFile = files.find(f => f.endsWith('.pem') && !f.includes('key'));
  const keyFile = files.find(f => f.includes('key') && f.endsWith('.pem'));

  if (certFile && keyFile) {
    return {
      certPath: path.join(certsDir, certFile),
      keyPath: path.join(certsDir, keyFile),
    };
  }
  return null;
}

export function startVite(options: ViteOptions = {}): void {
  const cwd = options.cwd || process.cwd();
  const toolkitRoot = getToolkitRoot();

  // Load .env file if it exists
  const envPath = path.join(cwd, '.env');
  let envVars: Record<string, string> = {};

  if (fs.existsSync(envPath)) {
    const envResult = dotenv.config({ path: envPath });
    if (envResult.parsed) {
      envVars = { ...envResult.parsed };
    }
  }

  // Determine HTTPS settings
  let useHttps = !options.noHttps;
  let certPath = '';
  let keyPath = '';

  if (useHttps) {
    const certsDir = path.join(cwd, '.certs');
    const existingCerts = findExistingCertificates(certsDir);
    if (existingCerts) {
      certPath = existingCerts.certPath;
      keyPath = existingCerts.keyPath;
    } else {
      useHttps = false; // No certs found, fall back to HTTP
    }
  }

  // Determine the port (priority: .env > default)
  const port = envVars.NODE_PORT || '3060';

  // Find vite.config.js (local or toolkit runtime)
  const localViteConfig = path.join(cwd, 'vite.config.js');
  // The correct vite.config.js is in the runtime directory, not the root
  const toolkitViteConfig = path.join(toolkitRoot, 'runtime', 'vite.config.js');
  const viteConfigPath = fs.existsSync(localViteConfig) ? localViteConfig : toolkitViteConfig;

  // Build final environment variables
  const env: Record<string, string> = {
    ...envVars,
    FORCE_COLOR: '1',
    NODE_PORT: port,
    USE_HTTPS: useHttps ? 'true' : 'false',
    CERT_PATH: certPath,
    KEY_PATH: keyPath,
    COMPONENT_PATH: envVars.COMPONENT_PATH || './src/Plugin.vue',
    NODE_LOG_LEVEL: envVars.NODE_LOG_LEVEL || 'info',
  };

  // Run vite directly with the correct config
  const config: ServiceConfig = {
    id: 'vite',
    name: 'Vite',
    command: 'pnpm',
    args: ['exec', 'vite', 'dev', '--config', viteConfigPath],
    cwd,
    env,
  };

  serviceManager.start(config);
}

export function stopVite(): boolean {
  return serviceManager.stop('vite');
}

export function isViteRunning(): boolean {
  return serviceManager.isRunning('vite');
}
