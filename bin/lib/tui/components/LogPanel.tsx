import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Box, Text, useStdout, useInput } from 'ink';

interface LogPanelProps {
  logs: string[];
  isActive?: boolean;
  maxHeight?: number; // Maximum height in rows (from parent container)
}

// Memoized log line component to prevent unnecessary re-renders
const LogLine = memo(({ log, index }: { log: string; index: number }) => (
  <Text key={index} wrap="wrap">
    {formatLog(log)}
  </Text>
));
LogLine.displayName = 'LogLine';

function LogPanel({ logs, isActive = true, maxHeight }: LogPanelProps) {
  const { stdout } = useStdout();
  const [scrollOffset, setScrollOffset] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);

  // Calculate visible lines based on provided maxHeight or terminal height
  // Subtract 2 for padding, 2 for border
  const maxLines = useMemo(() => {
    const defaultMaxLines = stdout ? Math.max(5, stdout.rows - 10) : 15;
    return maxHeight ? Math.max(3, maxHeight - 4) : defaultMaxLines;
  }, [stdout?.rows, maxHeight]);

  // Reset scroll when logs are cleared
  useEffect(() => {
    if (logs.length === 0) {
      setScrollOffset(0);
      setAutoScroll(true);
    }
  }, [logs.length]);

  // Auto-scroll to bottom when new logs arrive (if autoScroll is enabled)
  useEffect(() => {
    if (autoScroll) {
      setScrollOffset(0);
    }
  }, [logs.length, autoScroll]);

  // Handle keyboard input for scrolling
  useInput((input, key) => {
    if (!isActive) return;

    // Page Up - scroll up by half a page
    if (key.pageUp || (key.shift && key.upArrow)) {
      const maxOffset = Math.max(0, logs.length - maxLines);
      setScrollOffset(prev => Math.min(prev + Math.floor(maxLines / 2), maxOffset));
      setAutoScroll(false);
      return;
    }

    // Page Down - scroll down by half a page
    if (key.pageDown || (key.shift && key.downArrow)) {
      setScrollOffset(prev => {
        const newOffset = Math.max(prev - Math.floor(maxLines / 2), 0);
        if (newOffset === 0) setAutoScroll(true);
        return newOffset;
      });
      return;
    }

    // Home - scroll to top
    if (key.meta && key.upArrow) {
      const maxOffset = Math.max(0, logs.length - maxLines);
      setScrollOffset(maxOffset);
      setAutoScroll(false);
      return;
    }

    // End - scroll to bottom
    if (key.meta && key.downArrow) {
      setScrollOffset(0);
      setAutoScroll(true);
      return;
    }
  });

  // Calculate visible logs with scroll offset - memoized
  const { visibleLogs, startIndex, canScrollUp, canScrollDown } = useMemo(() => {
    const totalLogs = logs.length;
    const start = Math.max(0, totalLogs - maxLines - scrollOffset);
    const end = Math.max(0, totalLogs - scrollOffset);
    return {
      visibleLogs: logs.slice(start, end),
      startIndex: start,
      canScrollUp: start > 0,
      canScrollDown: scrollOffset > 0,
    };
  }, [logs, maxLines, scrollOffset]);

  return (
    <Box flexDirection="column" padding={1} flexGrow={1} overflow="hidden">
      {canScrollUp && (
        <Text color="gray" dimColor>↑ {startIndex} more lines (Shift+↑ to scroll)</Text>
      )}
      {visibleLogs.length === 0 ? (
        <Text color="gray" dimColor>No logs yet...</Text>
      ) : (
        visibleLogs.map((log, index) => (
          <LogLine key={startIndex + index} log={log} index={startIndex + index} />
        ))
      )}
      {canScrollDown && (
        <Text color="gray" dimColor>↓ {scrollOffset} more lines (Shift+↓ to scroll)</Text>
      )}
    </Box>
  );
}

function formatLog(log: string): React.ReactNode {
  // Color code different log types
  if (log.startsWith('[VITE]') || log.includes('VITE')) {
    return <Text color="cyan">{log}</Text>;
  }
  if (log.startsWith('[SOCKET]') || log.includes('Socket')) {
    return <Text color="green">{log}</Text>;
  }
  if (log.includes('error') || log.includes('Error') || log.includes('ERROR')) {
    return <Text color="red">{log}</Text>;
  }
  if (log.includes('warning') || log.includes('Warning') || log.includes('WARN')) {
    return <Text color="yellow">{log}</Text>;
  }
  if (log.includes('Starting') || log.includes('started')) {
    return <Text color="blue">{log}</Text>;
  }
  return <Text>{log}</Text>;
}

export default memo(LogPanel);
