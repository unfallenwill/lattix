import React from 'react';
import { Box, Text } from 'ink';
import { DIM } from '../utils/colors.js';

interface StatusBarProps {
  hints: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({ hints }) => {
  return (
    <Box
      borderStyle="single"
      borderTop={true}
      paddingX={1}
    >
      <Text color={DIM}>{hints}</Text>
    </Box>
  );
};
