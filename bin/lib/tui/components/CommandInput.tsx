import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

// Command definitions with descriptions - comprehensive list
const COMMANDS = [
  // Dev server commands
  { cmd: '/dev', args: '', desc: 'Start Vite dev server' },
  { cmd: '/dev', args: '--with-socket', desc: 'Start Vite + Socket.IO' },
  { cmd: '/dev', args: '--with-mock', desc: 'Start Vite + Socket.IO + Mock API' },
  { cmd: '/dev', args: '--no-https', desc: 'Start Vite without SSL' },
  { cmd: '/dev', args: '--no-socket', desc: 'Start Vite without Socket.IO' },
  { cmd: '/dev', args: '--chrome', desc: 'Start Vite + Chrome extension' },
  { cmd: '/dev', args: '--firefox', desc: 'Start Vite + Firefox extension' },

  // Socket commands
  { cmd: '/socket', args: '', desc: 'Start Socket.IO server' },
  { cmd: '/socket', args: '--with-mock', desc: 'Start Socket.IO + Mock API' },
  { cmd: '/socket', args: 'send <event>', desc: 'Send a socket event' },
  { cmd: '/socket', args: 'list', desc: 'List available socket events' },
  { cmd: '/mock', args: '', desc: 'Start Socket.IO + Mock API (shorthand)' },

  // Browser extension commands
  { cmd: '/ext', args: 'chrome', desc: 'Launch Chrome with extension' },
  { cmd: '/ext', args: 'firefox', desc: 'Launch Firefox with extension' },

  // Service management
  { cmd: '/stop', args: '[service]', desc: 'Stop current or specified service' },
  { cmd: '/restart', args: '[service]', desc: 'Restart current or specified service' },
  { cmd: '/clear', args: '', desc: 'Clear current log panel' },

  // Config extraction
  { cmd: '/extract-config', args: '', desc: 'Extract GxP config from source' },
  { cmd: '/extract-config', args: '--dry-run', desc: 'Preview config extraction' },
  { cmd: '/extract-config', args: '--overwrite', desc: 'Overwrite existing config values' },

  // AI commands
  { cmd: '/gemini', args: '', desc: 'Open Gemini AI chat panel' },
  { cmd: '/gemini', args: 'enable', desc: 'Set up Google authentication' },
  { cmd: '/gemini', args: 'ask <query>', desc: 'Quick AI question' },
  { cmd: '/gemini', args: 'status', desc: 'Check AI auth status' },
  { cmd: '/gemini', args: 'logout', desc: 'Log out from Gemini' },
  { cmd: '/gemini', args: 'clear', desc: 'Clear conversation history' },
  { cmd: '/ai', args: '', desc: 'Open Gemini AI chat (alias)' },

  // General
  { cmd: '/help', args: '', desc: 'Show all commands' },
  { cmd: '/quit', args: '', desc: 'Exit application' },
  { cmd: '/exit', args: '', desc: 'Exit application (alias)' },
];

interface ActiveService {
  id: string;
  name: string;
  status: string;
}

interface CommandInputProps {
  onSubmit: (command: string) => void;
  activeService?: ActiveService | null;
  onSuggestionsChange?: (count: number) => void;
}

export default function CommandInput({ onSubmit, activeService, onSuggestionsChange }: CommandInputProps) {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);

  // Use ref to track if we should skip the next onChange (after programmatic update)
  const skipNextChange = useRef(false);
  // Track previous suggestion count to avoid unnecessary parent updates
  const prevSuggestionCount = useRef(0);

  // Filter commands based on typed value
  const suggestions = useMemo(() => {
    if (!value.startsWith('/')) return [];

    const search = value.toLowerCase();
    return COMMANDS.filter(c => {
      const fullCmd = c.args ? `${c.cmd} ${c.args}` : c.cmd;
      return fullCmd.toLowerCase().includes(search) ||
             c.cmd.toLowerCase().startsWith(search);
    }).slice(0, 8); // Limit to 8 suggestions for cleaner UI
  }, [value]);

  const showSuggestions = value.startsWith('/') && value.length >= 1 && suggestions.length > 0;

  // Helper to build full command string from suggestion
  const buildFullCommand = useCallback((suggestion: typeof COMMANDS[0]): string => {
    if (suggestion.args) {
      const hasPlaceholder = suggestion.args.includes('<') || suggestion.args.includes('[');
      if (!hasPlaceholder) {
        return `${suggestion.cmd} ${suggestion.args}`;
      }
    }
    return suggestion.cmd;
  }, []);

  // Notify parent when suggestions change (debounced to reduce flicker)
  useEffect(() => {
    const count = showSuggestions ? suggestions.length + 2 : 0;
    if (count !== prevSuggestionCount.current) {
      prevSuggestionCount.current = count;
      onSuggestionsChange?.(count);
    }
  }, [showSuggestions, suggestions.length, onSuggestionsChange]);

  // Reset selected suggestion when suggestions change
  useEffect(() => {
    if (selectedSuggestion >= suggestions.length) {
      setSelectedSuggestion(Math.max(0, suggestions.length - 1));
    }
  }, [suggestions.length, selectedSuggestion]);

  useInput((input, key) => {
    // Tab to autocomplete selected suggestion
    if (key.tab && showSuggestions && suggestions[selectedSuggestion]) {
      const suggestion = suggestions[selectedSuggestion];
      const fullCmd = buildFullCommand(suggestion);
      skipNextChange.current = true;
      setValue(fullCmd);
      setSelectedSuggestion(0);
      return;
    }

    // Up/Down to navigate suggestions when showing (circular navigation)
    if (showSuggestions) {
      if (key.upArrow) {
        setSelectedSuggestion(prev => {
          // Wrap to bottom when at top
          if (prev <= 0) return suggestions.length - 1;
          return prev - 1;
        });
        return;
      }
      if (key.downArrow) {
        setSelectedSuggestion(prev => {
          // Wrap to top when at bottom
          if (prev >= suggestions.length - 1) return 0;
          return prev + 1;
        });
        return;
      }
    } else {
      // History navigation when not showing suggestions
      if (key.upArrow && history.length > 0) {
        const newIndex = Math.min(historyIndex + 1, history.length - 1);
        setHistoryIndex(newIndex);
        skipNextChange.current = true;
        setValue(history[history.length - 1 - newIndex] || '');
        return;
      }

      if (key.downArrow) {
        const newIndex = Math.max(historyIndex - 1, -1);
        setHistoryIndex(newIndex);
        skipNextChange.current = true;
        if (newIndex < 0) {
          setValue('');
        } else {
          setValue(history[history.length - 1 - newIndex] || '');
        }
        return;
      }
    }

    // Escape to clear input or close suggestions
    if (key.escape) {
      setValue('');
      setSelectedSuggestion(0);
      setHistoryIndex(-1);
      return;
    }
  });

  const handleSubmit = useCallback((input: string) => {
    if (!input.trim()) return;

    // Add to history (avoid duplicates)
    setHistory(prev => [...prev.filter(h => h !== input.trim()), input.trim()]);

    // Reset state
    setValue('');
    setHistoryIndex(-1);
    setSelectedSuggestion(0);

    // Call handler
    onSubmit(input);
  }, [onSubmit]);

  // Handle text input changes
  const handleChange = useCallback((v: string) => {
    if (skipNextChange.current) {
      skipNextChange.current = false;
      return;
    }
    setValue(v);
    setSelectedSuggestion(0);
  }, []);

  // Get context-specific hints for current tab
  const hints = useMemo((): string[] => {
    const h: string[] = [];

    if (activeService) {
      const isRunning = activeService.status === 'running' || activeService.status === 'starting';
      if (isRunning && activeService.id !== 'system') {
        h.push(`Ctrl+K stop`);
      }
    }

    h.push('Ctrl+L clear');
    h.push('←/→ tabs');
    h.push('Esc cancel');

    return h;
  }, [activeService]);

  return (
    <Box flexDirection="column">
      {/* Suggestions dropdown (above input) */}
      {showSuggestions && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          marginBottom={0}
        >
          {suggestions.map((suggestion, index) => (
            <Box key={`${suggestion.cmd}-${suggestion.args}-${index}`} paddingX={1}>
              <Text
                backgroundColor={index === selectedSuggestion ? 'blue' : undefined}
                color={index === selectedSuggestion ? 'white' : 'cyan'}
                bold={index === selectedSuggestion}
              >
                {suggestion.cmd}
              </Text>
              {suggestion.args && (
                <Text
                  color={index === selectedSuggestion ? 'white' : 'gray'}
                  backgroundColor={index === selectedSuggestion ? 'blue' : undefined}
                >
                  {' '}{suggestion.args}
                </Text>
              )}
              <Text color="gray"> - </Text>
              <Text
                color={index === selectedSuggestion ? 'white' : 'gray'}
                dimColor={index !== selectedSuggestion}
              >
                {suggestion.desc}
              </Text>
            </Box>
          ))}
          <Box paddingX={1}>
            <Text dimColor>Tab complete · ↑↓ select · Esc cancel</Text>
          </Box>
        </Box>
      )}

      {/* Input box */}
      <Box
        borderStyle="single"
        borderColor="cyan"
        paddingX={1}
      >
        <Text color="cyan" bold>&gt;</Text>
        <Text> </Text>
        <TextInput
          value={value}
          onChange={handleChange}
          onSubmit={() => handleSubmit(value.startsWith('/') ? value : '/' + value)}
          placeholder="Type / to run a command..."
        />
      </Box>

      {/* Hints bar (below input) */}
      <Box paddingX={1} justifyContent="space-between">
        <Box>
          {hints.map((hint, index) => (
            <React.Fragment key={hint}>
              {index > 0 && <Text color="gray"> · </Text>}
              <Text dimColor>{hint}</Text>
            </React.Fragment>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
