import { serviceManager, ServiceConfig } from './ServiceManager.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

export type BrowserType = 'chrome' | 'firefox';

export interface ExtensionOptions {
  browser: BrowserType;
  cwd?: string;
  useHttps?: boolean;
  port?: number | string;
}

// Get the toolkit root directory
function getToolkitRoot(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // Navigate from dist/tui/services to project root (3 levels up)
  // dist/tui/services -> dist/tui -> dist -> gx-toolkit
  return path.resolve(__dirname, '..', '..', '..');
}

// Find the extension path (project-local or toolkit built-in)
function findExtensionPath(browser: BrowserType, cwd: string): string | null {
  // Check local project first
  const localPath = path.join(cwd, 'browser-extensions', browser);
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  // Fall back to toolkit's built-in extension
  const toolkitPath = path.join(getToolkitRoot(), 'browser-extensions', browser);
  if (fs.existsSync(toolkitPath)) {
    return toolkitPath;
  }

  return null;
}

export function startExtension(options: ExtensionOptions): void {
  const { browser, useHttps = true, port = 3060 } = options;
  const cwd = options.cwd || process.cwd();
  const serviceId = `ext-${browser}`;

  // Compute the start URL based on options
  const protocol = useHttps ? 'https' : 'http';
  const startUrl = `${protocol}://localhost:${port}`;

  // Check if already running
  if (serviceManager.isRunning(serviceId)) {
    return;
  }

  const extensionPath = findExtensionPath(browser, cwd);
  if (!extensionPath) {
    // Create a dummy service to show the error
    const errorState = serviceManager.start({
      id: serviceId,
      name: `${browser.charAt(0).toUpperCase() + browser.slice(1)} Extension`,
      command: 'echo',
      args: [`Extension not found for ${browser}`],
      cwd,
    });
    return;
  }

  if (browser === 'firefox') {
    const config: ServiceConfig = {
      id: serviceId,
      name: 'Firefox Extension',
      command: 'npx',
      args: ['web-ext', 'run', '--source-dir', extensionPath, '--start-url', startUrl],
      cwd,
      env: {
        FORCE_COLOR: '1',
      },
    };
    serviceManager.start(config);
  } else if (browser === 'chrome') {
    // For Chrome, we need to use the launch script
    const toolkitRoot = getToolkitRoot();
    let scriptPath = path.join(cwd, 'scripts', 'launch-chrome.js');

    if (!fs.existsSync(scriptPath)) {
      scriptPath = path.join(toolkitRoot, 'scripts', 'launch-chrome.js');
    }

    if (!fs.existsSync(scriptPath)) {
      const errorState = serviceManager.start({
        id: serviceId,
        name: 'Chrome Extension',
        command: 'echo',
        args: ['Chrome launcher script not found'],
        cwd,
      });
      return;
    }

    const config: ServiceConfig = {
      id: serviceId,
      name: 'Chrome Extension',
      command: 'node',
      args: [scriptPath],
      cwd,
      env: {
        FORCE_COLOR: '1',
        CHROME_EXTENSION_PATH: extensionPath,
        USE_HTTPS: String(useHttps),
        NODE_PORT: String(port),
      },
    };
    serviceManager.start(config);
  }
}

export function stopExtension(browser: BrowserType): boolean {
  return serviceManager.stop(`ext-${browser}`);
}

export function isExtensionRunning(browser: BrowserType): boolean {
  return serviceManager.isRunning(`ext-${browser}`);
}
