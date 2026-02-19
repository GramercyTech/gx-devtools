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
  // We patch stdin.emit to intercept mouse sequences BEFORE Ink processes them,
  // preventing the escape codes from appearing in the command input
  useEffect(() => {
    if (!isActive || !process.stdin.isTTY) return;

    const mouseRegex = /\x1b\[<(\d+);\d+;\d+[Mm]/g;
    const originalEmit = process.stdin.emit;

    // Patch emit to intercept mouse data before Ink sees it
    const stdin = process.stdin;
    stdin.emit = function (this: typeof stdin, event: string, ...args: any[]): boolean {
      if (event === 'data') {
        const data = args[0];
        const str = typeof data === 'string' ? data : data.toString();

        // Check for mouse sequences
        let hasMouseEvent = false;
        let match;
        while ((match = mouseRegex.exec(str)) !== null) {
          hasMouseEvent = true;
          const button = parseInt(match[1], 10);
          if (button === 64) {
            // Scroll up
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
        mouseRegex.lastIndex = 0;

        if (hasMouseEvent) {
          // Strip mouse sequences, forward any remaining non-mouse data to Ink
          const remaining = str.replace(mouseRegex, '');
          if (remaining.length > 0) {
            return originalEmit.call(stdin, event, remaining);
          }
          return true; // consumed entirely
        }
      }
      return originalEmit.apply(stdin, [event, ...args]);
    } as typeof stdin.emit;

    // Disable mouse mode helper - used on unmount and process exit
    const disableMouse = () => {
      if (mouseEnabledRef.current) {
        process.stdout.write('\x1b[?1000l\x1b[?1006l');
        mouseEnabledRef.current = false;
      }
    };

    // Ensure mouse mode is disabled on process exit/signals
    const onExit = () => disableMouse();
    process.on('exit', onExit);
    process.on('SIGINT', onExit);
    process.on('SIGTERM', onExit);

    // Enable SGR mouse mode for wheel events
    process.stdout.write('\x1b[?1000h\x1b[?1006h');
    mouseEnabledRef.current = true;

    return () => {
      // Restore original emit and disable mouse mode
      process.stdin.emit = originalEmit;
      disableMouse();
      process.off('exit', onExit);
      process.off('SIGINT', onExit);
      process.off('SIGTERM', onExit);
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
