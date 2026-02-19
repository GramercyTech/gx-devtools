import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import WelcomeScreen from './components/WelcomeScreen.js';
import Header from './components/Header.js';
import TabBar from './components/TabBar.js';
import LogPanel from './components/LogPanel.js';
import CommandInput from './components/CommandInput.js';
import AIPanel from './components/AIPanel.js';
import {
  serviceManager,
  startVite,
  stopVite,
  startSocket,
  stopSocket,
  startExtension,
  stopExtension,
  listSocketEvents,
  sendSocketEvent,
  ServiceStatus,
  BrowserType,
  aiService,
  getAvailableProviders,
  getProviderStatus,
  AIProvider,
} from './services/index.js';

export interface Service {
  id: string;
  name: string;
  status: ServiceStatus;
  logs: string[];
}

interface ExtractedConfig {
  strings: Record<string, string>;
  settings: Record<string, unknown>;
  assets: Record<string, string>;
  triggerState: Record<string, unknown>;
  dependencies: Array<{ identifier: string; path: string; events?: Record<string, string> }>;
}

export interface AppProps {
  autoStart?: string[];
  args?: Record<string, unknown>;
}

export default function App({ autoStart, args }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [suggestionRows, setSuggestionRows] = useState(0);

  // Get terminal height for full screen
  const terminalHeight = stdout?.rows || 24;

  // Stable callback for suggestion row changes to prevent unnecessary re-renders
  const handleSuggestionsChange = useCallback((count: number) => {
    setSuggestionRows(count);
  }, []);

  // Sync services from ServiceManager
  const syncServices = useCallback(() => {
    const managerServices = serviceManager.getAllServices();
    setServices(managerServices.map(s => ({
      id: s.id,
      name: s.name,
      status: s.status,
      logs: s.logs,
    })));
  }, []);

  // Set up ServiceManager event listeners
  useEffect(() => {
    const onLog = (id: string, message: string) => {
      setServices(prev => prev.map(s =>
        s.id === id ? { ...s, logs: [...s.logs, message] } : s
      ));
    };

    const onStatusChange = (id: string, status: ServiceStatus) => {
      setServices(prev => prev.map(s =>
        s.id === id ? { ...s, status } : s
      ));
    };

    const onLogsCleared = (id: string) => {
      setServices(prev => prev.map(s =>
        s.id === id ? { ...s, logs: [] } : s
      ));
    };

    serviceManager.on('log', onLog);
    serviceManager.on('statusChange', onStatusChange);
    serviceManager.on('logsCleared', onLogsCleared);

    return () => {
      serviceManager.off('log', onLog);
      serviceManager.off('statusChange', onStatusChange);
      serviceManager.off('logsCleared', onLogsCleared);
    };
  }, []);

  // Cleanup on exit
  useEffect(() => {
    const cleanup = () => {
      serviceManager.forceStopAll();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    return () => {
      cleanup();
      process.off('SIGINT', cleanup);
      process.off('SIGTERM', cleanup);
    };
  }, []);

  // Handle keyboard shortcuts
  useInput((input, key) => {
    // Ctrl+C to exit
    if (key.ctrl && input === 'c') {
      serviceManager.forceStopAll();
      exit();
      return;
    }

    // Ctrl+L to clear current log
    if (key.ctrl && input === 'l') {
      if (services[activeTab]) {
        serviceManager.clearLogs(services[activeTab].id);
      }
      return;
    }

    // Ctrl+K to stop current service
    if (key.ctrl && input === 'k') {
      if (services[activeTab] && services[activeTab].id !== 'system') {
        stopService(services[activeTab].id);
      }
      return;
    }

    // Left/Right arrow to switch tabs (Tab is reserved for command autocomplete)
    if (key.leftArrow && services.length > 0) {
      setActiveTab((activeTab - 1 + services.length) % services.length);
      return;
    }
    if (key.rightArrow && services.length > 0) {
      setActiveTab((activeTab + 1) % services.length);
      return;
    }

    // Ctrl+1-9 or Cmd+1-9 to switch tabs directly
    if ((key.ctrl || key.meta) && /^[1-9]$/.test(input)) {
      const tabIndex = parseInt(input) - 1;
      if (tabIndex < services.length) {
        setActiveTab(tabIndex);
      }
      return;
    }
  });

  // Handle auto-start commands
  useEffect(() => {
    if (autoStart?.length) {
      setTimeout(() => {
        autoStart.forEach(cmd => {
          handleCommand(`/${cmd}`);
        });
      }, 100);
    }
  }, []);

  const handleCommand = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) return;

    const parts = trimmed.slice(1).split(' ');
    const command = parts[0];
    const cmdArgs = parts.slice(1);

    switch (command) {
      case 'help':
        addSystemLog(getHelpText());
        break;

      case 'dev':
        startDevServer(cmdArgs);
        break;

      case 'socket':
        if (cmdArgs[0] === 'send') {
          handleSocketSend(cmdArgs.slice(1));
        } else if (cmdArgs[0] === 'list') {
          handleSocketList();
        } else {
          const socketWithMock = cmdArgs.includes('--with-mock') || args?.withMock === true;
          startSocketServer(socketWithMock);
        }
        break;

      case 'mock':
        // Shorthand for /socket --with-mock
        startSocketServer(true);
        break;

      case 'ext':
        const browser = cmdArgs[0] || 'chrome';
        launchExtension(browser);
        break;

      case 'stop':
        stopService(cmdArgs[0]);
        break;

      case 'restart':
        restartService(cmdArgs[0]);
        break;

      case 'clear':
        if (services[activeTab]) {
          serviceManager.clearLogs(services[activeTab].id);
        }
        break;

      case 'quit':
      case 'exit':
        serviceManager.forceStopAll();
        exit();
        break;

      case 'ai':
        handleAICommand(cmdArgs);
        break;

      case 'extract-config':
      case 'extract':
        handleExtractConfig(cmdArgs);
        break;

      case 'add-dependency':
        handleAddDependency(cmdArgs);
        break;

      default:
        addSystemLog(`Unknown command: ${command}. Type /help for available commands.`);
    }
  };

  const startDevServer = (cmdArgs: string[]) => {
    const noHttps = cmdArgs.includes('--no-https') || args?.noHttps === true;
    const noSocket = cmdArgs.includes('--no-socket') || args?.noSocket === true;
    const withSocket = cmdArgs.includes('--with-socket') || args?.withSocket === true;
    const withMock = cmdArgs.includes('--with-mock') || args?.withMock === true;
    const withFirefox = cmdArgs.includes('--firefox') || args?.firefox === true;
    const withChrome = cmdArgs.includes('--chrome') || args?.chrome === true;

    // Determine port from env or default
    const port = process.env.NODE_PORT || 3060;
    const useHttps = !noHttps;

    // Check SOCKET_IO_ENABLED env var (default to socket if enabled, unless --no-socket)
    const socketEnabled = process.env.SOCKET_IO_ENABLED === 'true';
    // Mock API requires socket server
    const shouldStartSocket = !noSocket && (withSocket || socketEnabled || withMock);

    // Check if already running
    if (serviceManager.isRunning('vite')) {
      addSystemLog('Vite dev server is already running.');
      // Switch to vite tab
      const viteIdx = services.findIndex(s => s.id === 'vite');
      if (viteIdx >= 0) setActiveTab(viteIdx);
      return;
    }

    startVite({ noHttps });

    // Also start socket server based on flags/env (with mock if requested)
    if (shouldStartSocket && !serviceManager.isRunning('socket')) {
      startSocket({ withMock });
    }

    // Launch browser extensions if requested (pass URL options)
    if (withFirefox && !serviceManager.isRunning('ext-firefox')) {
      startExtension({ browser: 'firefox', useHttps, port });
    }
    if (withChrome && !serviceManager.isRunning('ext-chrome')) {
      startExtension({ browser: 'chrome', useHttps, port });
    }

    // Sync and switch to the new vite tab
    const updatedServices = serviceManager.getAllServices();
    const viteIdx = updatedServices.findIndex(s => s.id === 'vite');
    setServices(updatedServices.map(s => ({
      id: s.id,
      name: s.name,
      status: s.status,
      logs: s.logs,
    })));
    setActiveTab(viteIdx >= 0 ? viteIdx : Math.max(0, updatedServices.length - 1));
  };

  const startSocketServer = (withMock: boolean = false) => {
    if (serviceManager.isRunning('socket')) {
      addSystemLog('Socket.IO server is already running.');
      const socketIdx = services.findIndex(s => s.id === 'socket');
      if (socketIdx >= 0) setActiveTab(socketIdx);
      return;
    }

    startSocket({ withMock });

    // Sync and switch to the new socket tab
    const updatedServices = serviceManager.getAllServices();
    const socketIdx = updatedServices.findIndex(s => s.id === 'socket');
    setServices(updatedServices.map(s => ({
      id: s.id,
      name: s.name,
      status: s.status,
      logs: s.logs,
    })));
    setActiveTab(socketIdx >= 0 ? socketIdx : Math.max(0, updatedServices.length - 1));
  };

  const launchExtension = (browser: string) => {
    const browserType = browser.toLowerCase() as BrowserType;
    if (browserType !== 'chrome' && browserType !== 'firefox') {
      addSystemLog(`Invalid browser: ${browser}. Use 'chrome' or 'firefox'.`);
      return;
    }

    const serviceId = `ext-${browserType}`;
    if (serviceManager.isRunning(serviceId)) {
      addSystemLog(`${browser} extension is already running.`);
      const extIdx = services.findIndex(s => s.id === serviceId);
      if (extIdx >= 0) setActiveTab(extIdx);
      return;
    }

    startExtension({ browser: browserType });

    // Sync and switch to the new extension tab
    const updatedServices = serviceManager.getAllServices();
    const extIdx = updatedServices.findIndex(s => s.id === serviceId);
    setServices(updatedServices.map(s => ({
      id: s.id,
      name: s.name,
      status: s.status,
      logs: s.logs,
    })));
    setActiveTab(extIdx >= 0 ? extIdx : Math.max(0, updatedServices.length - 1));
  };

  const stopService = (serviceId?: string) => {
    const targetId = serviceId || services[activeTab]?.id;
    if (!targetId) {
      addSystemLog('No service specified. Usage: /stop <service-id>');
      return;
    }

    if (targetId === 'vite') {
      stopVite();
    } else if (targetId === 'socket') {
      stopSocket();
    } else if (targetId.startsWith('ext-')) {
      const browser = targetId.replace('ext-', '') as BrowserType;
      stopExtension(browser);
    } else {
      serviceManager.stop(targetId);
    }

    syncServices();
  };

  const restartService = (serviceId?: string) => {
    const targetId = serviceId || services[activeTab]?.id;
    if (!targetId) {
      addSystemLog('No service to restart. Usage: /restart [service-id]');
      return;
    }

    if (targetId === 'system') {
      addSystemLog('Cannot restart the system service.');
      return;
    }

    const success = serviceManager.restart(targetId);
    if (!success) {
      addSystemLog(`Cannot restart "${targetId}". Service config not found.`);
    }
    syncServices();
  };

  const handleAICommand = async (cmdArgs: string[]) => {
    const subCommand = cmdArgs[0];

    switch (subCommand) {
      case 'model':
        // Set or show current AI provider
        const providerArg = cmdArgs[1] as AIProvider | undefined;
        if (providerArg) {
          const result = aiService.setProvider(providerArg);
          if (result.success) {
            addSystemLog(`✅ ${result.message}`);
          } else {
            addSystemLog(`❌ ${result.message}`);
          }
        } else {
          // Show current provider and available providers
          const current = aiService.getProviderInfo();
          const providers = getAvailableProviders();
          let message = `Current AI provider: ${current ? getProviderStatus(current) : 'None'}\n\nAvailable providers:`;
          for (const p of providers) {
            const status = p.available ? getProviderStatus(p) : `${p.name} (not available)`;
            const marker = p.id === current?.id ? ' ← current' : '';
            message += `\n  ${p.id}: ${status}${marker}`;
            if (!p.available && p.reason) {
              message += `\n       ${p.reason}`;
            }
          }
          message += '\n\nUsage: /ai model <claude|codex|gemini>';
          addSystemLog(message);
        }
        break;

      case 'status':
        // Show detailed status of all providers
        const providers = getAvailableProviders();
        const currentProvider = aiService.getProvider();
        let statusMsg = 'AI Provider Status:\n';
        for (const p of providers) {
          const icon = p.available ? '✅' : '❌';
          const current = p.id === currentProvider ? ' (current)' : '';
          statusMsg += `\n  ${icon} ${getProviderStatus(p)}${current}`;
          if (!p.available && p.reason) {
            statusMsg += `\n     ${p.reason}`;
          }
        }
        addSystemLog(statusMsg);
        break;

      case 'ask':
        // Quick question without opening panel
        const question = cmdArgs.slice(1).join(' ');
        if (!question) {
          addSystemLog('Usage: /ai ask <your question>');
          return;
        }
        if (!aiService.isAvailable()) {
          addSystemLog(`Current provider (${aiService.getProvider()}) is not available. Run /ai model to select a different provider.`);
          return;
        }
        const providerName = aiService.getProviderInfo()?.name || 'AI';
        addSystemLog(`Asking ${providerName}: ${question}`);
        try {
          aiService.loadProjectContext(process.cwd());
          const response = await aiService.sendMessage(question);
          addSystemLog(`${providerName}: ${response}`);
        } catch (err) {
          addSystemLog(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
        break;

      case 'clear':
        aiService.clearConversation();
        addSystemLog('Conversation history cleared.');
        break;

      case 'chat':
      default:
        // Open AI chat panel
        if (!aiService.isAvailable()) {
          addSystemLog(`Current provider (${aiService.getProvider()}) is not available. Run /ai model to select a different provider.`);
          return;
        }
        setShowAIPanel(true);
    }
  };

  const addSystemLog = (message: string) => {
    // Use functional update to properly handle rapid successive calls
    setServices(prev => {
      const existingSystem = prev.find(s => s.id === 'system');
      if (existingSystem) {
        // Add message to existing system service
        return prev.map(s =>
          s.id === 'system' ? { ...s, logs: [...s.logs, message] } : s
        );
      } else {
        // Create new system service with the message
        const newService: Service = {
          id: 'system',
          name: 'System',
          status: 'running',
          logs: [message],
        };
        return [...prev, newService];
      }
    });

    // Switch to system tab
    setTimeout(() => {
      setServices(current => {
        const sysIdx = current.findIndex(s => s.id === 'system');
        if (sysIdx >= 0) setActiveTab(sysIdx);
        return current; // Don't modify, just read
      });
    }, 50);
  };

  const handleSocketSend = async (eventArgs: string[]) => {
    if (!eventArgs.length) {
      addSystemLog('Usage: /socket send <event-name> [identifier]');
      return;
    }

    const eventName = eventArgs[0];
    const identifier = eventArgs[1];

    addSystemLog(`Sending socket event: ${eventName}...`);

    const result = await sendSocketEvent(eventName, identifier);
    if (result.success) {
      addSystemLog(`✅ ${result.message}`);
    } else {
      addSystemLog(`❌ ${result.message}`);
    }
  };

  const handleSocketList = () => {
    const events = listSocketEvents();
    if (events.length === 0) {
      addSystemLog('No socket events found. Check your socket-events directory.');
      return;
    }

    let message = 'Available socket events:\n';
    for (const event of events) {
      message += `\n  ${event.name}\n`;
      message += `    Event: ${event.event}\n`;
      message += `    Channel: ${event.channel}`;
    }
    message += '\n\nUsage: /socket send <event-name> [identifier]';
    addSystemLog(message);
  };

  const handleExtractConfig = async (cmdArgs: string[]) => {
    const dryRun = cmdArgs.includes('--dry-run') || cmdArgs.includes('-d');
    const overwrite = cmdArgs.includes('--overwrite') || cmdArgs.includes('-o');

    addSystemLog('Scanning source files for GxP configuration...');

    try {
      // Use dynamic imports for ES modules
      const path = await import('path');
      const fs = await import('fs');
      const url = await import('url');
      const { createRequire } = await import('module');

      // Get the directory of this file and resolve to the utils directory
      const __filename = url.fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);

      // The compiled JS is in dist/tui/, utils is in bin/lib/utils/
      // From dist/tui/ we need to go up to package root, then into bin/lib/utils/
      const packageRoot = path.resolve(__dirname, '..', '..');
      const utilsPath = path.join(packageRoot, 'bin', 'lib', 'utils', 'extract-config.js');

      // Create a require function to load CommonJS modules
      const requireCjs = createRequire(import.meta.url);
      const extractConfigUtils = requireCjs(utilsPath) as {
        extractConfigFromSource: (srcDir: string) => ExtractedConfig;
        mergeConfig: (existing: Record<string, unknown>, extracted: ExtractedConfig, options: { overwrite: boolean }) => Record<string, unknown>;
        generateSummary: (config: ExtractedConfig) => string;
      };

      const projectPath = process.cwd();
      const srcDir = path.join(projectPath, 'src');
      const manifestPath = path.join(projectPath, 'app-manifest.json');

      // Check if src directory exists
      if (!fs.existsSync(srcDir)) {
        addSystemLog('Source directory not found: src/');
        return;
      }

      // Extract configuration
      const extractedConfig = extractConfigUtils.extractConfigFromSource(srcDir);
      const summary = extractConfigUtils.generateSummary(extractedConfig);
      addSystemLog(summary);

      // Count total items
      const totalItems =
        Object.keys(extractedConfig.strings).length +
        Object.keys(extractedConfig.settings).length +
        Object.keys(extractedConfig.assets).length +
        Object.keys(extractedConfig.triggerState).length +
        extractedConfig.dependencies.length;

      if (totalItems === 0) {
        addSystemLog('No GxP configuration found in source files.');
        return;
      }

      if (dryRun) {
        addSystemLog('Dry run mode - no changes made.');
        addSystemLog('Run /extract-config without --dry-run to apply changes.');
        return;
      }

      // Load or create manifest
      let existingManifest: Record<string, unknown> = {};
      if (fs.existsSync(manifestPath)) {
        try {
          existingManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        } catch {
          addSystemLog('Could not parse existing manifest, creating new one.');
          existingManifest = getDefaultManifest();
        }
      } else {
        addSystemLog('Creating new app-manifest.json');
        existingManifest = getDefaultManifest();
      }

      // Merge and write
      const mergedManifest = extractConfigUtils.mergeConfig(existingManifest, extractedConfig, { overwrite });
      fs.writeFileSync(manifestPath, JSON.stringify(mergedManifest, null, '\t'));
      addSystemLog('Updated app-manifest.json');
    } catch (err) {
      addSystemLog(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleAddDependency = async (cmdArgs: string[]) => {
    // The add-dependency wizard requires interactive terminal access (raw stdin)
    // which conflicts with Ink's own stdin handling. Run it in a separate terminal.
    const envFlag = cmdArgs.find(a => a === '-e' || a === '--env');
    const envVal = envFlag ? cmdArgs[cmdArgs.indexOf(envFlag) + 1] : '';
    const cmd = `gxdev add-dependency${envVal ? ` -e ${envVal}` : ''}`;

    addSystemLog('');
    addSystemLog('The Add Dependency wizard requires interactive terminal access.');
    addSystemLog('Run this command in a separate terminal:');
    addSystemLog('');
    addSystemLog(`  \x1B[36m${cmd}\x1B[0m`);
    addSystemLog('');
  };

  const getDefaultManifest = () => ({
    name: 'GxToolkit',
    version: '1.0.0',
    description: 'GxToolkit Plugin',
    manifest_version: 3,
    asset_dir: '/src/assets/',
    configurationFile: 'configuration.json',
    appInstructionsFile: 'app-instructions.md',
    defaultStylingFile: 'default-styling.css',
    settings: {},
    strings: { default: {} },
    assets: {},
    triggerState: {},
    dependencies: [],
    permissions: [],
  });

  const getHelpText = () => `
Available commands:

  Development Server:
    /dev                  Start Vite dev server
    /dev --with-socket    Start Vite + Socket.IO
    /dev --with-mock      Start Vite + Socket.IO + Mock API
    /dev --no-https       Start without SSL
    /dev --no-socket      Start without Socket.IO
    /dev --chrome         Start + launch Chrome extension
    /dev --firefox        Start + launch Firefox extension

  Socket.IO:
    /socket               Start Socket.IO server
    /socket --with-mock   Start with Mock API enabled
    /socket send <event>  Send a socket event
    /socket list          List available events
    /mock                 Shorthand for /socket --with-mock

  Browser Extensions:
    /ext chrome           Launch Chrome with GxP extension
    /ext firefox          Launch Firefox with GxP extension

  Config Extraction:
    /extract-config       Extract GxP config from source
    /extract-config -d    Dry run (preview changes)
    /extract-config -o    Overwrite existing values

  Dependencies:
    /add-dependency       Add API dependency wizard
    /add-dependency -e    Specify environment (staging, production, local)

  AI Assistant:
    /ai                   Open AI chat with current provider
    /ai model             Show available AI providers
    /ai model <name>      Switch to claude, codex, or gemini
    /ai ask <query>       Quick question to AI
    /ai status            Check provider availability
    /ai clear             Clear conversation history

  Service Management:
    /stop [service]       Stop current or specified service
    /restart [service]    Restart a service
    /clear                Clear current log panel
    /help                 Show this help
    /quit                 Exit application

Keyboard shortcuts:
  ←/→              Switch tabs
  Ctrl+1/2/3...    Jump to tab directly
  Shift+↑/↓        Scroll logs
  Ctrl+↑/↓         Jump to top/bottom of logs
  Ctrl+L           Clear current log
  Ctrl+K           Stop current service
  Ctrl+C           Exit application
  Tab              Autocomplete command
  ↑/↓              Navigate suggestions or command history
  Esc              Clear input
`;

  // Show AI panel
  if (showAIPanel) {
    return (
      <AIPanel
        onClose={() => setShowAIPanel(false)}
        onLog={addSystemLog}
      />
    );
  }

  const currentService = services[activeTab];

  // Calculate log panel height to make room for suggestions
  // Fixed elements: Header (3), TabBar (1), Log border (2), Input (3), Hints (1) = 10 rows minimum
  const fixedRows = 10;
  const availableForLog = terminalHeight - fixedRows - suggestionRows;
  const logPanelHeight = Math.max(3, availableForLog); // Minimum 3 rows for log panel

  return (
    <Box flexDirection="column" height={terminalHeight}>
      <Header projectName={process.cwd().split('/').pop() || 'gxdev'} />

      {services.length > 0 && (
        <TabBar
          services={services}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      )}

      <Box height={logPanelHeight} flexDirection="column" borderStyle="single" borderColor="gray" overflow="hidden">
        {currentService ? (
          <LogPanel logs={currentService.logs} maxHeight={logPanelHeight} />
        ) : (
          <WelcomeScreen />
        )}
      </Box>

      <CommandInput
        onSubmit={handleCommand}
        activeService={currentService ? {
          id: currentService.id,
          name: currentService.name,
          status: currentService.status
        } : null}
        onSuggestionsChange={handleSuggestionsChange}
      />
    </Box>
  );
}
