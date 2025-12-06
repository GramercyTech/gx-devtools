import React from 'react';
import { Box, Text } from 'ink';
import type { Service } from '../App.js';

interface TabBarProps {
  services: Service[];
  activeTab: number;
  onTabChange: (index: number) => void;
}

const STATUS_COLORS: Record<Service['status'], string> = {
  stopped: 'gray',
  starting: 'yellow',
  running: 'green',
  error: 'red',
};

const STATUS_ICONS: Record<Service['status'], string> = {
  stopped: '○',
  starting: '◐',
  running: '●',
  error: '✖',
};

export default function TabBar({ services, activeTab, onTabChange }: TabBarProps) {
  return (
    <Box paddingX={1} gap={2} justifyContent="space-between">
      <Box gap={2}>
        {services.map((service, index) => {
          const isActive = index === activeTab;
          const statusColor = STATUS_COLORS[service.status];
          const statusIcon = STATUS_ICONS[service.status];

          return (
            <Box key={service.id}>
              <Text
                color={isActive ? 'white' : 'gray'}
                backgroundColor={isActive ? 'blue' : undefined}
                bold={isActive}
              >
                {' '}
                <Text color={statusColor}>{statusIcon}</Text>
                {' '}
                {service.name}
                {' '}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box>
        <Text color="gray">Tab/←→ switch tabs</Text>
      </Box>
    </Box>
  );
}
