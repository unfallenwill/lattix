#!/usr/bin/env node
import React, { useEffect } from 'react';
import { render, Box, Text, useApp } from 'ink';
import { Command } from 'commander';
import chalk from 'chalk';
import { loadTasks, saveTasks, generateId } from './store.js';
import { Task } from './types.js';
import App from './app.js';

const program = new Command();
program.name('taskcli').version('1.0.0').description('A beautiful CLI task manager');

// Helper component for showing messages and auto-exiting
const SuccessMessage = ({ text }: { text: string }) => {
  const { exit } = useApp();
  useEffect(() => {
    const timer = setTimeout(() => exit(), 100);
    return () => clearTimeout(timer);
  }, [exit]);
  return <Text color="green">{text}</Text>;
};

const ErrorMessage = ({ text }: { text: string }) => {
  const { exit } = useApp();
  useEffect(() => {
    const timer = setTimeout(() => exit(), 100);
    return () => clearTimeout(timer);
  }, [exit]);
  return <Text color="red">{text}</Text>;
};

// Wrapper to render and auto-exit after a tick
function renderAndExit(component: React.ReactElement) {
  const { unmount } = render(component);
}

// Task status type for validation
type TaskStatus = 'todo' | 'in-progress' | 'done';
type TaskPriority = 'low' | 'medium' | 'high';

function isValidTaskStatus(value: string): value is TaskStatus {
  return ['todo', 'in-progress', 'done'].includes(value);
}

function isValidTaskPriority(value: string): value is TaskPriority {
  return ['low', 'medium', 'high'].includes(value);
}

// Simple task row renderer (no useInput, safe for non-TTY)
const TaskRow = ({ task }: { task: Task }) => {
  const shortId = task.id.substring(0, 8);
  const truncatedTitle = task.title.length > 30 ? task.title.substring(0, 27) + '…' : task.title;
  const updatedDate = task.updatedAt.slice(0, 10);
  const statusStr = task.status.padEnd(12);
  const priorityStr = task.priority.padEnd(8);

  return (
    <Box gap={1}>
      <Text color="gray">{shortId}</Text>
      <Text color={task.status === 'todo' ? 'yellow' : task.status === 'in-progress' ? 'blue' : 'green'}>{statusStr}</Text>
      <Text color={task.priority === 'high' ? 'red' : task.priority === 'medium' ? 'yellow' : 'gray'}>{priorityStr}</Text>
      <Text>{truncatedTitle.padEnd(30)}</Text>
      <Text color="gray">{updatedDate}</Text>
    </Box>
  );
};

// Add command
program
  .command('add')
  .option('-t, --title <title>', 'Task title')
  .option('-d, --description <description>', 'Task description')
  .option('-p, --priority <priority>', 'Task priority (low, medium, high)')
  .action((options) => {
    const { title, description, priority } = options;

    if (!title) {
      renderAndExit(<ErrorMessage text="Error: Title is required" />);
      return;
    }

    const tasks = loadTasks();
    const newTask: Task = {
      id: generateId(),
      title,
      description: description || '',
      status: 'todo',
      priority: isValidTaskPriority(priority) ? priority : 'medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveTasks([...tasks, newTask]);
    renderAndExit(<SuccessMessage text={`Task added: ${title}`} />);
  });

// List command
program
  .command('list')
  .alias('ls')
  .option('-s, --status <status>', 'Filter by status')
  .option('-p, --priority <priority>', 'Filter by priority')
  .action((options) => {
    const tasks = loadTasks();
    let filteredTasks = tasks;

    if (options.status && isValidTaskStatus(options.status)) {
      filteredTasks = filteredTasks.filter(t => t.status === options.status);
    }

    if (options.priority && isValidTaskPriority(options.priority)) {
      filteredTasks = filteredTasks.filter(t => t.priority === options.priority);
    }

    const ListComponent = () => {
      const { exit } = useApp();
      useEffect(() => {
        const timer = setTimeout(() => exit(), 50);
        return () => clearTimeout(timer);
      }, [exit]);

      if (filteredTasks.length === 0) {
        return <Text color="yellow">No tasks found.</Text>;
      }

      return (
        <Box flexDirection="column">
          <Box gap={1}>
            <Text color="gray">{'ID'.padEnd(10)}</Text>
            <Text color="gray">{'STATUS'.padEnd(12)}</Text>
            <Text color="gray">{'PRIORITY'.padEnd(8)}</Text>
            <Text color="gray">{'TITLE'.padEnd(30)}</Text>
            <Text color="gray">UPDATED</Text>
          </Box>
          {filteredTasks.map(task => <TaskRow key={task.id} task={task} />)}
        </Box>
      );
    };

    renderAndExit(<ListComponent />);
  });

// Delete command
program
  .command('delete <id>')
  .alias('rm')
  .option('-f, --force', 'Skip confirmation')
  .action((id, options) => {
    const tasks = loadTasks();
    const taskIndex = tasks.findIndex(t => t.id === id);

    if (taskIndex === -1) {
      renderAndExit(<ErrorMessage text={`Error: Task with ID ${id} not found`} />);
      return;
    }

    if (options.force) {
      const updatedTasks = tasks.filter(t => t.id !== id);
      saveTasks(updatedTasks);
      renderAndExit(<SuccessMessage text={`Task deleted: ${tasks[taskIndex].title}`} />);
    } else {
      // For non-interactive delete, we need to handle confirmation
      // For now, require -f flag in single-command mode
      renderAndExit(
        <ErrorMessage text="Use -f flag to force deletion in single-command mode" />
      );
    }
  });

// Update command
program
  .command('update <id>')
  .option('-t, --title <title>', 'New title')
  .option('-d, --description <description>', 'New description')
  .option('-s, --status <status>', 'New status')
  .option('-p, --priority <priority>', 'New priority')
  .action((id, options) => {
    const tasks = loadTasks();
    const taskIndex = tasks.findIndex(t => t.id === id);

    if (taskIndex === -1) {
      renderAndExit(<ErrorMessage text={`Error: Task with ID ${id} not found`} />);
      return;
    }

    const updatedTasks = [...tasks];
    const task = { ...updatedTasks[taskIndex] };

    if (options.title) task.title = options.title;
    if (options.description !== undefined) task.description = options.description;
    if (options.status && isValidTaskStatus(options.status)) task.status = options.status;
    if (options.priority && isValidTaskPriority(options.priority)) task.priority = options.priority;
    task.updatedAt = new Date().toISOString();

    updatedTasks[taskIndex] = task;
    saveTasks(updatedTasks);

    renderAndExit(<SuccessMessage text={`Task updated: ${task.title}`} />);
  });

// Search command
program
  .command('search <query>')
  .action((query) => {
    const tasks = loadTasks();
    const lowerQuery = query.toLowerCase();
    const filteredTasks = tasks.filter(
      t => t.title.toLowerCase().includes(lowerQuery) ||
           (t.description && t.description.toLowerCase().includes(lowerQuery))
    );

    const SearchComponent = () => {
      const { exit } = useApp();
      useEffect(() => {
        const timer = setTimeout(() => exit(), 50);
        return () => clearTimeout(timer);
      }, [exit]);

      if (filteredTasks.length === 0) {
        return <Text color="yellow">No matching tasks found.</Text>;
      }

      return (
        <Box flexDirection="column">
          <Text color="cyan">Found {filteredTasks.length} task(s)</Text>
          <Box gap={1} marginTop={1}>
            <Text color="gray">{'ID'.padEnd(10)}</Text>
            <Text color="gray">{'STATUS'.padEnd(12)}</Text>
            <Text color="gray">{'PRIORITY'.padEnd(8)}</Text>
            <Text color="gray">{'TITLE'.padEnd(30)}</Text>
            <Text color="gray">UPDATED</Text>
          </Box>
          {filteredTasks.map(task => <TaskRow key={task.id} task={task} />)}
        </Box>
      );
    };

    renderAndExit(<SearchComponent />);
  });

// Stats command
program
  .command('stats')
  .action(() => {
    const tasks = loadTasks();

    const StatsComponent = () => {
      const { exit } = useApp();
      useEffect(() => {
        const timer = setTimeout(() => exit(), 50);
        return () => clearTimeout(timer);
      }, [exit]);

      if (tasks.length === 0) {
        return <Text color="yellow">No tasks yet. Add some with `taskcli add`!</Text>;
      }

      const total = tasks.length;
      const todo = tasks.filter(t => t.status === 'todo').length;
      const inProgress = tasks.filter(t => t.status === 'in-progress').length;
      const done = tasks.filter(t => t.status === 'done').length;
      const high = tasks.filter(t => t.priority === 'high').length;
      const medium = tasks.filter(t => t.priority === 'medium').length;
      const low = tasks.filter(t => t.priority === 'low').length;
      const lastTask = tasks.reduce((a, b) => new Date(a.updatedAt) > new Date(b.updatedAt) ? a : b);

      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>Task Statistics</Text>
          <Text color="gray">{'─'.repeat(30)}</Text>
          <Text>Total: <Text color="cyan">{total}</Text> task{total !== 1 ? 's' : ''}</Text>
          <Box flexDirection="column" gap={0} marginTop={1}>
            <Text bold>By Status:</Text>
            <Text>  ○ <Text color="yellow">Todo</Text>: {todo}</Text>
            <Text>  ◐ <Text color="blue">In Progress</Text>: {inProgress}</Text>
            <Text>  ● <Text color="green">Done</Text>: {done}</Text>
          </Box>
          <Box flexDirection="column" gap={0} marginTop={1}>
            <Text bold>By Priority:</Text>
            <Text>  ▲ <Text color="red">High</Text>: {high}</Text>
            <Text>  ● <Text color="yellow">Medium</Text>: {medium}</Text>
            <Text>  ▽ <Text color="gray">Low</Text>: {low}</Text>
          </Box>
          <Box marginTop={1}>
            <Text>Last updated: <Text bold>{lastTask.title}</Text> (<Text color="gray">{lastTask.updatedAt.slice(0, 10)}</Text>)</Text>
          </Box>
        </Box>
      );
    };

    renderAndExit(<StatsComponent />);
  });

// Interactive command (default)
program
  .command('interactive', { isDefault: true })
  .alias('i')
  .description('Interactive mode (default)')
  .action(() => {
    render(<App />);
  });

program.parse(process.argv);
