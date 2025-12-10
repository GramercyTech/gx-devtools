import React from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
  projectName: string;
}

export default function Header({ projectName }: HeaderProps) {
  return (
    <Box
      borderStyle="single"
      borderColor="blue"
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        <Text color="blue" bold>GxP</Text>
        <Text color="white"> DevStudio</Text>
        <Text color="gray"> - </Text>
        <Text color="cyan">{projectName}</Text>
      </Box>
      <Box>
        <Text color="gray">Ctrl+C to quit</Text>
      </Box>
    </Box>
  );
}
