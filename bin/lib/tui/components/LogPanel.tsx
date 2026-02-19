import React, { useState, useEffect, useMemo, useRef, memo } from 'react';
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
  const mouseEnabledRef = useRef(false);
  const logsLengthRef = useRef(logs.length);
  const maxLinesRef = useRef(0);

  // Keep refs in sync
  logsLengthRef.current = logs.length;

  // Calculate visible lines based on provided maxHeight or terminal height
  // Subtract 2 for padding, 2 for border, 1 for hint bar
  const maxLines = useMemo(() => {
    const defaultMaxLines = stdout ? Math.max(5, stdout.rows - 10) : 15;
    return maxHeight ? Math.max(3, maxHeight - 5) : defaultMaxLines;
  }, [stdout?.rows, maxHeight]);

  maxLinesRef.current = maxLines;

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

  // Scroll helper functions
  const scrollUp = (lines: number) => {
    const maxOffset = Math.max(0, logs.length - maxLines);
    setScrollOffset(prev => Math.min(prev + lines, maxOffset));
    setAutoScroll(false);
  };

  const scrollDown = (lines: number) => {
    setScrollOffset(prev => {
      const newOffset = Math.max(prev - lines, 0);
      if (newOffset === 0) setAutoScroll(true);
      return newOffset;
    });
  };

  // Enable mouse wheel scrolling via terminal mouse reporting
  useEffect(() => {
    if (!isActive || !process.stdin.isTTY) return;

    // Enable SGR mouse mode for wheel events
    process.stdout.write('\x1b[?1000h\x1b[?1006h');
    mouseEnabledRef.current = true;

    const handleData = (data: Buffer) => {
      const str = data.toString();
      // SGR mouse format: \x1b[<button;col;rowM (press) or \x1b[<button;col;rowm (release)
      const match = str.match(/\x1b\[<(\d+);\d+;\d+[Mm]/);
      if (match) {
        const button = parseInt(match[1], 10);
        if (button === 64) {
          // Scroll up - use refs to avoid stale closures
          const maxOffset = Math.max(0, logsLengthRef.current - maxLinesRef.current);
          setScrollOffset(prev => Math.min(prev + 3, maxOffset));
          setAutoScroll(false);
        } else if (button === 65) {
          // Scroll down
          setScrollOffset(prev => {
            const newOffset = Math.max(prev - 3, 0);
            if (newOffset === 0) setAutoScroll(true);
            return newOffset;
          });
        }
      }
    };

    process.stdin.on('data', handleData);

    return () => {
      process.stdin.off('data', handleData);
      if (mouseEnabledRef.current) {
        process.stdout.write('\x1b[?1000l\x1b[?1006l');
        mouseEnabledRef.current = false;
      }
    };
  }, [isActive]);

  // Handle keyboard input for scrolling
  useInput((input, key) => {
    if (!isActive) return;

    // Page Up - scroll up by half a page
    if (key.pageUp || (key.shift && key.upArrow)) {
      scrollUp(Math.floor(maxLines / 2));
      return;
    }

    // Page Down - scroll down by half a page
    if (key.pageDown || (key.shift && key.downArrow)) {
      scrollDown(Math.floor(maxLines / 2));
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
      <Box justifyContent="flex-end">
        <Text color="gray" dimColor>Shift+↑↓ scroll  Ctrl+↑↓ jump  mouse wheel</Text>
      </Box>
      {canScrollUp && (
        <Text color="gray" dimColor>↑ {startIndex} more lines</Text>
      )}
      {visibleLogs.length === 0 ? (
        <Text color="gray" dimColor>No logs yet...</Text>
      ) : (
        visibleLogs.map((log, index) => (
          <LogLine key={startIndex + index} log={log} index={startIndex + index} />
        ))
      )}
      {canScrollDown && (
        <Text color="gray" dimColor>↓ {scrollOffset} more lines</Text>
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
