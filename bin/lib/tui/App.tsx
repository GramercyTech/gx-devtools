import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import WelcomeScreen from './components/WelcomeScreen.js';
import Header from './components/Header.js';
import TabBar from './components/TabBar.js';
import LogPanel from './components/LogPanel.js';
import CommandInput from './components/CommandInput.js';
import GeminiPanel from './components/GeminiPanel.js';
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
  geminiService,
  isAuthenticated,
  clearAuthTokens,
} from './services/index.js';

export interface Service {
  id: string;
  name: string;
  status: ServiceStatus;
  logs: string[];
}

export interface AppProps {
  autoStart?: string[];
  args?: Record<string, unknown>;
}

export default function App({ autoStart, args }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [showGemini, setShowGemini] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [suggestionRows, setSuggestionRows] = useState(0);

  // Get terminal height for full screen
  const terminalHeight = stdout?.rows || 24;

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

    // Tab to cycle through tabs (when not in input)
    if (key.tab && services.length > 0) {
      const nextTab = key.shift
        ? (activeTab - 1 + services.length) % services.length
        : (activeTab + 1) % services.length;
      setActiveTab(nextTab);
      return;
    }

    // Left/Right arrow to switch tabs
    if (key.leftArrow && services.length > 0) {
      setActiveTab((activeTab - 1 + services.length) % services.length);
      return;
    }
    if (key.rightArrow && services.length > 0) {
      setActiveTab((activeTab + 1) % services.length);
      return;
    }

    // Ctrl+1-9 or Cmd+1-9 to switch tabs (for compatibility)
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
          startSocketServer();
        }
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

      case 'gemini':
      case 'ai':
        handleGeminiCommand(cmdArgs);
        break;

      default:
        addSystemLog(`Unknown command: ${command}. Type /help for available commands.`);
    }
  };

  const startDevServer = (cmdArgs: string[]) => {
    const noHttps = cmdArgs.includes('--no-https') || args?.noHttps === true;
    const noSocket = cmdArgs.includes('--no-socket') || args?.noSocket === true;
    const withSocket = cmdArgs.includes('--with-socket') || args?.withSocket === true;
    const withFirefox = cmdArgs.includes('--firefox') || args?.firefox === true;
    const withChrome = cmdArgs.includes('--chrome') || args?.chrome === true;

    // Determine port from env or default
    const port = process.env.NODE_PORT || 3060;
    const useHttps = !noHttps;

    // Check SOCKET_IO_ENABLED env var (default to socket if enabled, unless --no-socket)
    const socketEnabled = process.env.SOCKET_IO_ENABLED === 'true';
    const shouldStartSocket = !noSocket && (withSocket || socketEnabled);

    // Check if already running
    if (serviceManager.isRunning('vite')) {
      addSystemLog('Vite dev server is already running.');
      // Switch to vite tab
      const viteIdx = services.findIndex(s => s.id === 'vite');
      if (viteIdx >= 0) setActiveTab(viteIdx);
      return;
    }

    startVite({ noHttps });

    // Also start socket server based on flags/env
    if (shouldStartSocket && !serviceManager.isRunning('socket')) {
      startSocket();
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

  const startSocketServer = () => {
    if (serviceManager.isRunning('socket')) {
      addSystemLog('Socket.IO server is already running.');
      const socketIdx = services.findIndex(s => s.id === 'socket');
      if (socketIdx >= 0) setActiveTab(socketIdx);
      return;
    }

    startSocket();

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

  const handleGeminiCommand = async (cmdArgs: string[]) => {
    const subCommand = cmdArgs[0];

    switch (subCommand) {
      case 'enable':
        addSystemLog('Starting Google OAuth flow...');
        addSystemLog('A browser window will open for authentication.');
        const result = await geminiService.startOAuthFlow();
        if (result.success) {
          addSystemLog(`✅ ${result.message}`);
        } else {
          addSystemLog(`❌ ${result.message}`);
        }
        break;

      case 'logout':
      case 'disable':
        clearAuthTokens();
        addSystemLog('Logged out from Gemini AI.');
        break;

      case 'status':
        if (isAuthenticated()) {
          addSystemLog('✅ Gemini AI is authenticated and ready.');
        } else {
          addSystemLog('❌ Not authenticated. Run /gemini enable to set up.');
        }
        break;

      case 'ask':
        // Quick question without opening panel
        const question = cmdArgs.slice(1).join(' ');
        if (!question) {
          addSystemLog('Usage: /gemini ask <your question>');
          return;
        }
        if (!isAuthenticated()) {
          addSystemLog('Not authenticated. Run /gemini enable first.');
          return;
        }
        addSystemLog(`Asking Gemini: ${question}`);
        try {
          geminiService.loadProjectContext(process.cwd());
          const response = await geminiService.sendMessage(question);
          addSystemLog(`Gemini: ${response}`);
        } catch (err) {
          addSystemLog(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
        break;

      case 'clear':
        geminiService.clearConversation();
        addSystemLog('Conversation history cleared.');
        break;

      default:
        // No subcommand = open chat panel
        if (!isAuthenticated()) {
          addSystemLog('Not authenticated. Run /gemini enable to set up Google authentication.');
          return;
        }
        setShowGemini(true);
    }
  };

  const addSystemLog = (message: string) => {
    // Find or create system service for general messages
    let systemService = services.find(s => s.id === 'system');
    if (!systemService) {
      const newService: Service = {
        id: 'system',
        name: 'System',
        status: 'running',
        logs: [message],
      };
      setServices(prev => {
        const updated = [...prev, newService];
        return updated;
      });
      if (services.length === 0) setActiveTab(0);
    } else {
      setServices(prev => prev.map(s =>
        s.id === 'system' ? { ...s, logs: [...s.logs, message] } : s
      ));
    }

    // Switch to system tab
    setTimeout(() => {
      const sysIdx = services.findIndex(s => s.id === 'system');
      if (sysIdx >= 0) setActiveTab(sysIdx);
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

  const getHelpText = () => `
Available commands:
  /dev                  Start Vite (+ Socket if SOCKET_IO_ENABLED=true)
  /dev --with-socket    Start Vite + Socket.IO together
  /dev --no-socket      Start Vite only (skip Socket.IO)
  /dev --no-https       Start Vite without SSL
  /dev --firefox        Start Vite + Firefox extension
  /dev --chrome         Start Vite + Chrome extension
  /socket               Start Socket.IO server
  /socket send <event>  Send socket event
  /socket list          List available events
  /ext chrome           Launch Chrome extension
  /ext firefox          Launch Firefox extension
  /stop [service]       Stop a running service
  /restart [service]    Restart a service
  /clear                Clear current log panel
  /gemini               Open Gemini AI chat panel
  /gemini enable        Set up Google authentication
  /gemini ask <query>   Quick question to Gemini
  /gemini status        Check authentication status
  /gemini logout        Log out from Gemini
  /help                 Show this help message
  /quit                 Exit the application

Keyboard shortcuts:
  Tab / Shift+Tab  Cycle through tabs
  Left/Right       Switch tabs
  Cmd+1/2/3...     Jump to tab (Mac)
  Shift+Up/Down    Scroll logs
  Cmd+Up/Down      Jump to top/bottom of logs
  Ctrl+L           Clear current log
  Ctrl+C           Exit application
  Up/Down          Command history (in input)
`;

  // Show Gemini panel
  if (showGemini) {
    return (
      <GeminiPanel
        onClose={() => setShowGemini(false)}
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
      <Header projectName={process.cwd().split('/').pop() || 'gxtk'} />

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
        onSuggestionsChange={setSuggestionRows}
      />
    </Box>
  );
}
