import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Task } from '../types.js';
import { DIM } from '../utils/colors.js';
import { TaskItem } from './TaskItem.js';

interface TaskListProps {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onBack: () => void;
}

export const TaskList: React.FC<TaskListProps> = ({ tasks, onSelectTask, onDeleteTask, onBack }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (selectedIndex >= tasks.length) {
      setSelectedIndex(0);
    }
  }, [tasks.length, selectedIndex]);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min(tasks.length - 1, prev + 1));
    } else if (key.return && tasks.length > 0) {
      onSelectTask(tasks[selectedIndex]);
    } else if (input === 'd' && tasks.length > 0) {
      onDeleteTask(tasks[selectedIndex].id);
    } else if (key.escape) {
      onBack();
    }
  });

  if (tasks.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color={DIM}>No tasks found. Press 'a' to add a task.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={1}>
        <Text color={DIM}>ID</Text>
        <Text color={DIM}>STATUS</Text>
        <Text color={DIM}>PRIORITY</Text>
        <Text color={DIM}>TITLE</Text>
        <Text color={DIM}>UPDATED</Text>
      </Box>
      {tasks.map((task, index) => (
        <TaskItem key={task.id} task={task} selected={index === selectedIndex} />
      ))}
    </Box>
  );
};
