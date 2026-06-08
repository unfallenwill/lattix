import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Select } from '@inkjs/ui';
import { loadTasks, saveTasks, generateId } from './store.js';
import { Task } from './types.js';
import { Header } from './components/Header.js';
import { StatusBar } from './components/StatusBar.js';
import { TaskList } from './components/TaskList.js';
import { TaskForm } from './components/TaskForm.js';
import { SearchPanel } from './components/SearchPanel.js';
import { StatsPanel } from './components/StatsPanel.js';

type View = 'menu' | 'list' | 'add' | 'search' | 'stats';

const viewHints: Record<View, string> = {
  menu: '↑↓ Navigate  Enter: Select  q: Quit',
  list: '↑↓ Navigate  Enter: View  d: Delete  Esc: Back',
  add: 'Enter: Confirm  Esc: Cancel',
  search: 'Type to search  ↑↓ Navigate  Enter: Select  Esc: Back',
  stats: 'Esc: Back',
};

const menuOptions = [
  { label: 'List Tasks', value: 'list' },
  { label: 'Add Task', value: 'add' },
  { label: 'Search', value: 'search' },
  { label: 'Statistics', value: 'stats' },
  { label: 'Quit', value: 'quit' },
];

export default function App() {
  const { exit } = useApp();
  const [view, setView] = useState<View>('menu');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const refreshTasks = useCallback(() => {
    setTasks(loadTasks());
  }, []);

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  const handleMenuSelect = useCallback((value: string) => {
    if (value === 'quit') {
      exit();
    } else {
      setView(value as View);
    }
  }, [exit]);

  const handleBackToMenu = useCallback(() => {
    setView('menu');
    setSelectedTaskId(null);
  }, []);

  const handleSelectTask = useCallback((task: Task) => {
    setSelectedTaskId(task.id);
    // For now, just go back - detail view is a nice-to-have
    setView('menu');
  }, []);

  const handleDeleteTask = useCallback((taskId: string) => {
    const updatedTasks = tasks.filter(t => t.id !== taskId);
    saveTasks(updatedTasks);
    refreshTasks();
  }, [tasks, refreshTasks]);

  const handleSubmitTask = useCallback((taskData: { title: string; description?: string; priority: 'low' | 'medium' | 'high' }) => {
    const newTask: Task = {
      ...taskData,
      status: 'todo',
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveTasks([...tasks, newTask]);
    refreshTasks();
    setView('list');
  }, [tasks, refreshTasks]);

  // Global key bindings for menu view
  useInput((input, key) => {
    if (view === 'menu' && input === 'q') {
      exit();
    }
    if (key.escape && view !== 'menu') {
      handleBackToMenu();
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      <Header taskCount={tasks.length} view={view} />

      <Box flexDirection="column" flexGrow={1}>
        {view === 'menu' && (
          <Box flexDirection="column" padding={1}>
            <Text bold>Welcome to TaskNexus</Text>
            <Box marginTop={1}>
              <Select options={menuOptions} onChange={handleMenuSelect} />
            </Box>
          </Box>
        )}

        {view === 'list' && (
          <TaskList
            tasks={tasks}
            onSelectTask={handleSelectTask}
            onDeleteTask={handleDeleteTask}
            onBack={handleBackToMenu}
          />
        )}

        {view === 'add' && (
          <TaskForm
            onSubmit={handleSubmitTask}
            onBack={handleBackToMenu}
          />
        )}

        {view === 'search' && (
          <SearchPanel
            tasks={tasks}
            onSelectTask={handleSelectTask}
            onBack={handleBackToMenu}
          />
        )}

        {view === 'stats' && (
          <StatsPanel
            tasks={tasks}
            onBack={handleBackToMenu}
          />
        )}
      </Box>

      <StatusBar hints={viewHints[view]} />
    </Box>
  );
}
