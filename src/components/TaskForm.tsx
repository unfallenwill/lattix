import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput, Select } from '@inkjs/ui';
import { DIM, ACCENT } from '../utils/colors.js';

interface TaskFormProps {
  onSubmit: (data: { title: string; description?: string; priority: 'low' | 'medium' | 'high' }) => void;
  onBack: () => void;
}

const STEPS = [
  { title: 'Title', step: 1 },
  { title: 'Description', step: 2 },
  { title: 'Priority', step: 3 },
] as const;

const PRIORITY_OPTIONS = [
  { label: '▽ Low', value: 'low' },
  { label: '● Medium', value: 'medium' },
  { label: '▲ High', value: 'high' },
];

export const TaskForm: React.FC<TaskFormProps> = ({ onSubmit, onBack }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');

  useInput((input, key) => {
    if (key.escape) {
      onBack();
    }
  });

  const handleTitleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      setTitle(trimmed);
      setCurrentStep(1);
    }
  };

  const handleDescriptionSubmit = (value: string) => {
    setDescription(value.trim());
    setCurrentStep(2);
  };

  const handlePriorityChange = (value: string) => {
    const priorityValue = value as 'low' | 'medium' | 'high';
    setPriority(priorityValue);
    onSubmit({ title, description, priority: priorityValue });
  };

  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={1}>
        <Text color={ACCENT}>Step {currentStep + 1}/3:</Text>
        <Text bold>{STEPS[currentStep].title}</Text>
      </Box>

      {currentStep === 0 && (
        <Box flexDirection="column" gap={1}>
          <TextInput placeholder="Task title..." onSubmit={handleTitleSubmit} />
        </Box>
      )}

      {currentStep === 1 && (
        <Box flexDirection="column" gap={1}>
          <TextInput placeholder="Description (optional)..." onSubmit={handleDescriptionSubmit} defaultValue={description} />
        </Box>
      )}

      {currentStep === 2 && (
        <Box flexDirection="column" gap={1}>
          <Select options={PRIORITY_OPTIONS} onChange={handlePriorityChange} defaultValue="medium" />
        </Box>
      )}

      {(title || description || priority) && (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text color={DIM}>Preview:</Text>
          {title && <Text dimColor={!title}><Text bold>Title:</Text> {title || <Text color={DIM}>(empty)</Text>}</Text>}
          {description && <Text dimColor={!description}><Text bold>Description:</Text> {description || <Text color={DIM}>(empty)</Text>}</Text>}
          {priority && <Text dimColor={!priority}><Text bold>Priority:</Text> {PRIORITY_OPTIONS.find(o => o.value === priority)?.label || priority}</Text>}
        </Box>
      )}
    </Box>
  );
};
