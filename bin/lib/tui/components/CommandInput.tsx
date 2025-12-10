import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

// Command definitions with descriptions
const COMMANDS = [
  { cmd: '/dev', args: '', desc: 'Start Vite (+ Socket if SOCKET_IO_ENABLED)' },
  { cmd: '/dev', args: '--with-socket', desc: 'Start Vite + Socket.IO' },
  { cmd: '/dev', args: '--with-mock', desc: 'Start Vite + Socket.IO + Mock API server' },
  { cmd: '/dev', args: '--firefox', desc: 'Start Vite + Firefox extension' },
  { cmd: '/dev', args: '--chrome', desc: 'Start Vite + Chrome extension' },
  { cmd: '/dev', args: '--no-socket', desc: 'Start Vite without Socket.IO' },
  { cmd: '/dev', args: '--no-https', desc: 'Start Vite without SSL' },
  { cmd: '/socket', args: '', desc: 'Start Socket.IO server' },
  { cmd: '/socket', args: 'send <event>', desc: 'Send socket event' },
  { cmd: '/socket', args: 'list', desc: 'List available events' },
  { cmd: '/ext', args: 'chrome', desc: 'Launch Chrome extension' },
  { cmd: '/ext', args: 'firefox', desc: 'Launch Firefox extension' },
  { cmd: '/stop', args: '[service]', desc: 'Stop current/specified service' },
  { cmd: '/restart', args: '[service]', desc: 'Restart current/specified service' },
  { cmd: '/clear', args: '', desc: 'Clear current log panel' },
  { cmd: '/gemini', args: '', desc: 'Open Gemini AI chat' },
  { cmd: '/gemini', args: 'enable', desc: 'Set up Google auth' },
  { cmd: '/gemini', args: 'ask <query>', desc: 'Quick AI question' },
  { cmd: '/help', args: '', desc: 'Show all commands' },
  { cmd: '/quit', args: '', desc: 'Exit application' },
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
  const [value, setValue] = useState('');  // The actual typed value (for filtering)
  const [displayValue, setDisplayValue] = useState('');  // What's shown in input (may differ when navigating)
  const [isNavigating, setIsNavigating] = useState(false);  // Track if user is arrowing through suggestions
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  // Key to force TextInput remount when value is set programmatically (resets cursor)
  const [inputKey, setInputKey] = useState(0);

  // Filter commands based on the TYPED value (not display value)
  const suggestions = useMemo(() => {
    if (!value.startsWith('/')) return [];

    const search = value.toLowerCase();
    return COMMANDS.filter(c => {
      const fullCmd = c.args ? `${c.cmd} ${c.args}` : c.cmd;
      return fullCmd.toLowerCase().includes(search) ||
             c.cmd.toLowerCase().startsWith(search);
    });
  }, [value]);

  const showSuggestions = value.startsWith('/') && value.length >= 1 && suggestions.length > 0;

  // Helper to build full command string from suggestion
  const buildFullCommand = (suggestion: typeof COMMANDS[0]): string => {
    if (suggestion.args) {
      const hasPlaceholder = suggestion.args.includes('<') || suggestion.args.includes('[');
      if (!hasPlaceholder) {
        return `${suggestion.cmd} ${suggestion.args}`;
      }
    }
    return suggestion.cmd;
  };

  // Notify parent when suggestions change (for layout adjustment)
  useEffect(() => {
    if (onSuggestionsChange) {
      // +2 for border and help text row
      onSuggestionsChange(showSuggestions ? suggestions.length + 2 : 0);
    }
  }, [showSuggestions, suggestions.length, onSuggestionsChange]);

  useInput((input, key) => {
    // Tab to autocomplete selected suggestion (commits the selection)
    if (key.tab && showSuggestions && suggestions[selectedSuggestion]) {
      const suggestion = suggestions[selectedSuggestion];
      const fullCmd = buildFullCommand(suggestion);
      // Commit to both value and displayValue
      setValue(fullCmd);
      setDisplayValue(fullCmd);
      setSelectedSuggestion(0);
      setIsNavigating(false);
      // Increment key to force TextInput remount (resets cursor to end)
      setInputKey(k => k + 1);
      return;
    }

    // Up/Down to navigate suggestions when showing
    if (showSuggestions) {
      if (key.upArrow) {
        const newIndex = Math.max(0, selectedSuggestion - 1);
        setSelectedSuggestion(newIndex);
        setIsNavigating(true);
        // Update display value to show highlighted command
        const suggestion = suggestions[newIndex];
        if (suggestion) {
          setDisplayValue(buildFullCommand(suggestion));
          setInputKey(k => k + 1);
        }
        return;
      }
      if (key.downArrow) {
        const newIndex = Math.min(suggestions.length - 1, selectedSuggestion + 1);
        setSelectedSuggestion(newIndex);
        setIsNavigating(true);
        // Update display value to show highlighted command
        const suggestion = suggestions[newIndex];
        if (suggestion) {
          setDisplayValue(buildFullCommand(suggestion));
          setInputKey(k => k + 1);
        }
        return;
      }
    } else {
      // History navigation when not showing suggestions
      if (key.upArrow && history.length > 0) {
        const newIndex = Math.min(historyIndex + 1, history.length - 1);
        setHistoryIndex(newIndex);
        const histVal = history[history.length - 1 - newIndex] || '';
        setValue(histVal);
        setDisplayValue(histVal);
        setInputKey(k => k + 1);
        return;
      }

      if (key.downArrow) {
        const newIndex = Math.max(historyIndex - 1, -1);
        setHistoryIndex(newIndex);
        if (newIndex < 0) {
          setValue('');
          setDisplayValue('');
        } else {
          const histVal = history[history.length - 1 - newIndex] || '';
          setValue(histVal);
          setDisplayValue(histVal);
        }
        setInputKey(k => k + 1);
        return;
      }
    }
  });

  const handleSubmit = (input: string) => {
    if (!input.trim()) return;

    // Add to history
    if (input.trim()) {
      setHistory(prev => [...prev.filter(h => h !== input.trim()), input.trim()]);
    }

    // Reset state
    setValue('');
    setDisplayValue('');
    setHistoryIndex(-1);
    setSelectedSuggestion(0);
    setIsNavigating(false);

    // Call handler
    onSubmit(input);
  };

  // Handle text input changes
  const handleChange = (v: string) => {
    // User typed something, reset navigation state
    setValue(v);
    setDisplayValue(v);
    setSelectedSuggestion(0);
    setIsNavigating(false);
  };

  // Get context-specific hints for current tab
  const getHints = (): string[] => {
    const hints: string[] = [];

    if (activeService) {
      const isRunning = activeService.status === 'running' || activeService.status === 'starting';
      if (isRunning) {
        hints.push(`Ctrl+K stop ${activeService.name}`);
        hints.push(`/restart to restart`);
      }
      if (activeService.id === 'vite') {
        hints.push('r to refresh browser');
      }
    }

    hints.push('Ctrl+L clear logs');
    hints.push('Tab/Arrow switch tabs');
    hints.push('Ctrl+C quit');

    return hints;
  };

  const hints = getHints();

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
          <Box paddingX={1} borderStyle={undefined}>
            <Text dimColor>Tab to complete · Up/Down to select</Text>
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
          key={inputKey}
          value={displayValue}
          onChange={handleChange}
          onSubmit={() => handleSubmit(displayValue.startsWith('/') ? displayValue : '/' + displayValue)}
          placeholder="Type / to run a command..."
        />
      </Box>

      {/* Hints bar (below input) */}
      <Box paddingX={1} justifyContent="space-between">
        <Box>
          {hints.slice(0, 4).map((hint, index) => (
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
