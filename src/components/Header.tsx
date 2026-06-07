import React from 'react';
import { Box, Text } from 'ink';
import { BRAND, DIM } from '../utils/colors.js';

interface HeaderProps {
  taskCount: number;
  view: string;
}

export const Header: React.FC<HeaderProps> = ({ taskCount, view }) => {
  return (
    <Box
      borderStyle="single"
      borderBottom={true}
      paddingX={1}
      justifyContent="space-between"
      width="100%"
    >
      <Text color={BRAND}>taskcli</Text>
      <Text>{view}</Text>
      <Text color={DIM}>{taskCount} tasks</Text>
    </Box>
  );
};
