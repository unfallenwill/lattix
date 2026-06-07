import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput } from '@inkjs/ui';
import { Task } from '../types.js';
import { DIM, ACCENT } from '../utils/colors.js';
import { TaskItem } from './TaskItem.js';

interface SearchPanelProps {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onBack: () => void;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({ tasks, onSelectTask, onBack }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredTasks = useMemo(() => {
    const lowerQuery = query.toLowerCase();
    return tasks.filter(task =>
      task.title.toLowerCase().includes(lowerQuery) ||
      (task.description && task.description.toLowerCase().includes(lowerQuery))
    );
  }, [tasks, query]);

  useInput((input, key) => {
    if (key.escape) {
      onBack();
    } else if (key.upArrow && filteredTasks.length > 0) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow && filteredTasks.length > 0) {
      setSelectedIndex(prev => Math.min(filteredTasks.length - 1, prev + 1));
    } else if (key.return && filteredTasks.length > 0) {
      onSelectTask(filteredTasks[selectedIndex]);
    }
  });

  const hasResults = filteredTasks.length > 0;

  return (
    <Box flexDirection="column" gap={1}>
      <TextInput placeholder="Search tasks..." defaultValue={query} onChange={setQuery} />

      {query && (
        <Box gap={1}>
          <Text color={ACCENT}>Found {filteredTasks.length} task(s)</Text>
        </Box>
      )}

      {hasResults && (
        <Box flexDirection="column" gap={1}>
          {filteredTasks.map((task, index) => (
            <TaskItem key={task.id} task={task} selected={index === selectedIndex} />
          ))}
        </Box>
      )}

      {query && !hasResults && (
        <Text color={DIM}>No tasks match your search.</Text>
      )}
    </Box>
  );
};
