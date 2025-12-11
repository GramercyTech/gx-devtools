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
  { cmd: '/ai', args: '', desc: 'Open AI chat with current provider' },
  { cmd: '/ai', args: 'model', desc: 'Show available AI providers' },
  { cmd: '/ai', args: 'model claude', desc: 'Switch to Claude AI' },
  { cmd: '/ai', args: 'model codex', desc: 'Switch to Codex AI' },
  { cmd: '/ai', args: 'model gemini', desc: 'Switch to Gemini AI' },
  { cmd: '/ai', args: 'ask <query>', desc: 'Quick AI question' },
  { cmd: '/ai', args: 'status', desc: 'Check provider availability' },
  { cmd: '/ai', args: 'clear', desc: 'Clear conversation history' },

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
  const [filterValue, setFilterValue] = useState(''); // What we filter suggestions by (doesn't change when arrowing)
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false); // True when user is arrowing through suggestions

  // Track if suggestions are currently shown to avoid flicker
  const prevShowSuggestions = useRef(false);

  // Maximum visible suggestions in the dropdown
  const MAX_VISIBLE = 8;

  // Filter commands based on filterValue (stays stable while navigating with arrows)
  const suggestions = useMemo(() => {
    if (!filterValue.startsWith('/')) return [];

    const search = filterValue.toLowerCase();
    return COMMANDS.filter(c => {
      const fullCmd = c.args ? `${c.cmd} ${c.args}` : c.cmd;
      return fullCmd.toLowerCase().includes(search) ||
             c.cmd.toLowerCase().startsWith(search);
    });
  }, [filterValue]);

  // Calculate visible window of suggestions (scrolls to keep selection visible)
  const { visibleSuggestions, startIndex } = useMemo(() => {
    if (suggestions.length <= MAX_VISIBLE) {
      return { visibleSuggestions: suggestions, startIndex: 0 };
    }

    // Calculate window to keep selected item visible
    let start = 0;
    if (selectedSuggestion >= MAX_VISIBLE) {
      // Selected item is beyond initial window, scroll down
      start = selectedSuggestion - MAX_VISIBLE + 1;
    }
    // Ensure we don't go past the end
    start = Math.min(start, suggestions.length - MAX_VISIBLE);
    start = Math.max(0, start);

    return {
      visibleSuggestions: suggestions.slice(start, start + MAX_VISIBLE),
      startIndex: start,
    };
  }, [suggestions, selectedSuggestion]);

  const showSuggestions = filterValue.startsWith('/') && filterValue.length >= 1 && suggestions.length > 0;

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

  // Notify parent when suggestions visibility changes (not on every count change)
  // This reduces flicker by only updating when suggestions appear/disappear
  useEffect(() => {
    if (showSuggestions !== prevShowSuggestions.current) {
      prevShowSuggestions.current = showSuggestions;
      const visibleCount = Math.min(suggestions.length, MAX_VISIBLE);
      const count = showSuggestions ? visibleCount + 4 : 0; // +4 for borders, scroll indicators, hint line
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
    // Tab to autocomplete selected suggestion and commit it
    if (key.tab && showSuggestions && suggestions[selectedSuggestion]) {
      const suggestion = suggestions[selectedSuggestion];
      const fullCmd = buildFullCommand(suggestion);
      setValue(fullCmd);
      setFilterValue(fullCmd); // Commit the selection to filter
      setSelectedSuggestion(0);
      setIsNavigating(false);
      return;
    }

    // Up/Down to navigate suggestions when showing (circular navigation)
    if (showSuggestions) {
      if (key.upArrow) {
        setIsNavigating(true);
        setSelectedSuggestion(prev => {
          const newIndex = prev <= 0 ? suggestions.length - 1 : prev - 1;
          // Update display value to show selected command
          const suggestion = suggestions[newIndex];
          if (suggestion) {
            setValue(buildFullCommand(suggestion));
          }
          return newIndex;
        });
        return;
      }
      if (key.downArrow) {
        setIsNavigating(true);
        setSelectedSuggestion(prev => {
          const newIndex = prev >= suggestions.length - 1 ? 0 : prev + 1;
          // Update display value to show selected command
          const suggestion = suggestions[newIndex];
          if (suggestion) {
            setValue(buildFullCommand(suggestion));
          }
          return newIndex;
        });
        return;
      }
    } else {
      // History navigation when not showing suggestions
      if (key.upArrow && history.length > 0) {
        const newIndex = Math.min(historyIndex + 1, history.length - 1);
        setHistoryIndex(newIndex);
        const historyValue = history[history.length - 1 - newIndex] || '';
        setValue(historyValue);
        setFilterValue(historyValue);
        return;
      }

      if (key.downArrow) {
        const newIndex = Math.max(historyIndex - 1, -1);
        setHistoryIndex(newIndex);
        if (newIndex < 0) {
          setValue('');
          setFilterValue('');
        } else {
          const historyValue = history[history.length - 1 - newIndex] || '';
          setValue(historyValue);
          setFilterValue(historyValue);
        }
        return;
      }
    }

    // Escape to clear input or close suggestions
    if (key.escape) {
      setValue('');
      setFilterValue('');
      setSelectedSuggestion(0);
      setHistoryIndex(-1);
      setIsNavigating(false);
      return;
    }
  });

  const handleSubmit = useCallback((input: string) => {
    if (!input.trim()) return;

    // Add to history (avoid duplicates)
    setHistory(prev => [...prev.filter(h => h !== input.trim()), input.trim()]);

    // Reset state
    setValue('');
    setFilterValue('');
    setHistoryIndex(-1);
    setSelectedSuggestion(0);
    setIsNavigating(false);

    // Call handler
    onSubmit(input);
  }, [onSubmit]);

  // Handle text input changes - updates both value and filter
  const handleChange = useCallback((v: string) => {
    setValue(v);
    setFilterValue(v); // When user types, update filter to match
    setSelectedSuggestion(0);
    setIsNavigating(false);
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
          {/* Scroll up indicator */}
          {startIndex > 0 && (
            <Box paddingX={1}>
              <Text color="gray">↑ {startIndex} more above</Text>
            </Box>
          )}
          {visibleSuggestions.map((suggestion, visibleIndex) => {
            const actualIndex = startIndex + visibleIndex;
            const isSelected = actualIndex === selectedSuggestion;
            return (
              <Box key={`${suggestion.cmd}-${suggestion.args}-${actualIndex}`} paddingX={1}>
                <Text
                  backgroundColor={isSelected ? 'blue' : undefined}
                  color={isSelected ? 'white' : 'cyan'}
                  bold={isSelected}
                >
                  {suggestion.cmd}
                </Text>
                {suggestion.args && (
                  <Text
                    color={isSelected ? 'white' : 'gray'}
                    backgroundColor={isSelected ? 'blue' : undefined}
                  >
                    {' '}{suggestion.args}
                  </Text>
                )}
                <Text color="gray"> - </Text>
                <Text
                  color={isSelected ? 'white' : 'gray'}
                  dimColor={!isSelected}
                >
                  {suggestion.desc}
                </Text>
              </Box>
            );
          })}
          {/* Scroll down indicator */}
          {startIndex + MAX_VISIBLE < suggestions.length && (
            <Box paddingX={1}>
              <Text color="gray">↓ {suggestions.length - startIndex - MAX_VISIBLE} more below</Text>
            </Box>
          )}
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
