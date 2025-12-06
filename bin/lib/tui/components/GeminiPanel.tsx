import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import {
  geminiService,
  isAuthenticated,
  loadGeminiConfig,
} from '../services/index.js';

interface GeminiPanelProps {
  onClose: () => void;
  onLog: (message: string) => void;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export default function GeminiPanel({ onClose, onLog }: GeminiPanelProps) {
  const { stdout } = useStdout();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Calculate available height for messages
  const maxMessageLines = stdout ? Math.max(5, stdout.rows - 8) : 10;

  // Check authentication on mount
  useEffect(() => {
    if (!isAuthenticated()) {
      setMessages([{
        role: 'system',
        content: 'Not authenticated. Run /gemini enable to set up Google authentication.',
      }]);
    } else {
      const config = loadGeminiConfig();
      setMessages([{
        role: 'system',
        content: `Gemini AI ready. ${config.projectContext ? 'Project context loaded.' : ''}\nType your message and press Enter. Press Escape to close.`,
      }]);
      // Load project context
      geminiService.loadProjectContext(process.cwd());
    }
  }, []);

  // Handle keyboard input
  useInput((char, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    // Scroll with Shift+Up/Down
    if (key.shift && key.upArrow) {
      setScrollOffset(prev => Math.min(prev + 1, Math.max(0, messages.length - maxMessageLines)));
      return;
    }
    if (key.shift && key.downArrow) {
      setScrollOffset(prev => Math.max(0, prev - 1));
      return;
    }
  });

  const handleSubmit = async (value: string) => {
    if (!value.trim() || isLoading) return;

    const userMessage = value.trim();
    setInput('');

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await geminiService.sendMessage(userMessage);
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
      setScrollOffset(0); // Auto-scroll to bottom
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setMessages(prev => [...prev, {
        role: 'system',
        content: `Error: ${errorMessage}`,
      }]);
      onLog(`Gemini error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Render messages with scrolling
  const renderMessages = () => {
    const start = Math.max(0, messages.length - maxMessageLines - scrollOffset);
    const end = messages.length - scrollOffset;
    const visibleMessages = messages.slice(start, end);

    return visibleMessages.map((msg, idx) => {
      let color: string;
      let prefix: string;

      switch (msg.role) {
        case 'user':
          color = 'cyan';
          prefix = 'You: ';
          break;
        case 'assistant':
          color = 'green';
          prefix = 'Gemini: ';
          break;
        default:
          color = 'yellow';
          prefix = '';
      }

      return (
        <Box key={start + idx} flexDirection="column" marginBottom={1}>
          <Text color={color} bold>{prefix}</Text>
          <Text wrap="wrap">{msg.content}</Text>
        </Box>
      );
    });
  };

  return (
    <Box flexDirection="column" height="100%" borderStyle="double" borderColor="magenta">
      <Box paddingX={1} justifyContent="space-between">
        <Text bold color="magenta">Gemini AI Assistant</Text>
        <Text color="gray" dimColor>Esc to close</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
        {messages.length > maxMessageLines + scrollOffset && (
          <Text color="gray" dimColor>
            ... {messages.length - maxMessageLines - scrollOffset} earlier messages
          </Text>
        )}
        {renderMessages()}
        {scrollOffset > 0 && (
          <Text color="gray" dimColor>... {scrollOffset} newer messages below</Text>
        )}
      </Box>

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        {isLoading ? (
          <Text color="yellow">Thinking...</Text>
        ) : (
          <Box>
            <Text color="magenta">&gt; </Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              placeholder="Ask Gemini something..."
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}
