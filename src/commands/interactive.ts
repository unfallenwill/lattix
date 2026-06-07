import { Command } from 'commander';
import chalk from 'chalk';
const inquirer = require('inquirer');
import { loadTasks, saveTasks, generateId } from '../store';
import { Task } from '../types';

export function registerInteractiveCommand(program: Command): void {
  program
    .command('interactive')
    .alias('i')
    .description('Interactive mode for task management')
    .action(async () => {
      while (true) {
        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
              { name: 'Add Task', value: 'add' },
              { name: 'List Tasks', value: 'list' },
              { name: 'Search Tasks', value: 'search' },
              { name: 'View Statistics', value: 'stats' },
              { name: 'Exit', value: 'exit' },
            ],
          },
        ]);

        if (action === 'exit') {
          console.log(chalk.gray('Goodbye!'));
          break;
        }

        switch (action) {
          case 'add':
            await addTask();
            break;
          case 'list':
            listTasks();
            break;
          case 'search':
            await searchTasks();
            break;
          case 'stats':
            showStats();
            break;
        }

        console.log();
      }
    });
}

async function addTask(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'title',
      message: 'Task title:',
      validate: (input: string) => input.trim().length > 0 || 'Title is required',
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description (optional):',
    },
    {
      type: 'list',
      name: 'priority',
      message: 'Priority:',
      choices: ['low', 'medium', 'high'],
      default: 'medium',
    },
  ]);

  const tasks = loadTasks();
  const now = new Date().toISOString();

  const newTask: Task = {
    id: generateId(),
    title: answers.title.trim(),
    description: answers.description?.trim() || undefined,
    status: 'todo',
    priority: answers.priority,
    createdAt: now,
    updatedAt: now,
  };

  tasks.push(newTask);
  saveTasks(tasks);

  console.log(chalk.green(`Task added: ${newTask.title}`));
}

function listTasks(): void {
  const tasks = loadTasks();

  if (tasks.length === 0) {
    console.log(chalk.yellow('No tasks found.'));
    return;
  }

  const idWidth = 10;
  const statusWidth = 14;
  const priorityWidth = 10;
  const titleWidth = 30;
  const dateWidth = 12;

  console.log(
    `${'ID'.padEnd(idWidth)}${'STATUS'.padEnd(statusWidth)}${'PRIORITY'.padEnd(priorityWidth)}${'TITLE'.padEnd(titleWidth)}${'UPDATED'}`
  );
  console.log(
    `${''.padEnd(idWidth, '-')}${''.padEnd(statusWidth, '-')}${''.padEnd(priorityWidth, '-')}${''.padEnd(titleWidth, '-')}${''.padEnd(dateWidth, '-')}`
  );

  tasks.forEach((task) => {
    const statusColored =
      task.status === 'todo'
        ? chalk.yellow(task.status.padEnd(11))
        : task.status === 'in-progress'
          ? chalk.blue(task.status.padEnd(11))
          : chalk.green(task.status.padEnd(11));

    const priorityColored =
      task.priority === 'high'
        ? chalk.red(task.priority.padEnd(8))
        : task.priority === 'medium'
          ? chalk.yellow(task.priority.padEnd(8))
          : chalk.gray(task.priority.padEnd(8));

    const id = task.id.slice(0, 8);
    const title = task.title.length > 28 ? task.title.slice(0, 27) + '…' : task.title;
    const updatedAt = task.updatedAt.slice(0, 10);

    console.log(
      `${id.padEnd(idWidth)}${statusColored}${priorityColored}${title.padEnd(titleWidth)}${updatedAt}`
    );
  });
}

async function searchTasks(): Promise<void> {
  const { query } = await inquirer.prompt([
    {
      type: 'input',
      name: 'query',
      message: 'Search query:',
      validate: (input: string) => input.trim().length > 0 || 'Query is required',
    },
  ]);

  const tasks = loadTasks();
  const searchTerm = query.toLowerCase();

  const matchingTasks = tasks.filter(
    (task) =>
      task.title.toLowerCase().includes(searchTerm) ||
      (task.description && task.description.toLowerCase().includes(searchTerm))
  );

  if (matchingTasks.length === 0) {
    console.log(chalk.yellow('No matching tasks found.'));
    return;
  }

  console.log(chalk.cyan(`Found ${matchingTasks.length} task(s)`));
  console.log();

  const idWidth = 10;
  const statusWidth = 14;
  const priorityWidth = 10;
  const titleWidth = 30;
  const dateWidth = 12;

  console.log(
    `${'ID'.padEnd(idWidth)}${'STATUS'.padEnd(statusWidth)}${'PRIORITY'.padEnd(priorityWidth)}${'TITLE'.padEnd(titleWidth)}${'UPDATED'}`
  );
  console.log(
    `${''.padEnd(idWidth, '-')}${''.padEnd(statusWidth, '-')}${''.padEnd(priorityWidth, '-')}${''.padEnd(titleWidth, '-')}${''.padEnd(dateWidth, '-')}`
  );

  matchingTasks.forEach((task) => {
    const statusColored =
      task.status === 'todo'
        ? chalk.yellow(task.status.padEnd(11))
        : task.status === 'in-progress'
          ? chalk.blue(task.status.padEnd(11))
          : chalk.green(task.status.padEnd(11));

    const priorityColored =
      task.priority === 'high'
        ? chalk.red(task.priority.padEnd(8))
        : task.priority === 'medium'
          ? chalk.yellow(task.priority.padEnd(8))
          : chalk.gray(task.priority.padEnd(8));

    const id = task.id.slice(0, 8);
    const title = task.title.length > 28 ? task.title.slice(0, 27) + '…' : task.title;
    const updatedAt = task.updatedAt.slice(0, 10);

    console.log(
      `${id.padEnd(idWidth)}${statusColored}${priorityColored}${title.padEnd(titleWidth)}${updatedAt}`
    );
  });
}

function showStats(): void {
  const tasks = loadTasks();

  if (tasks.length === 0) {
    console.log(chalk.yellow('No tasks yet. Add some with `taskcli add`!'));
    return;
  }

  const total = tasks.length;

  const statusCounts = {
    todo: tasks.filter(t => t.status === 'todo').length,
    'in-progress': tasks.filter(t => t.status === 'in-progress').length,
    done: tasks.filter(t => t.status === 'done').length,
  };

  const priorityCounts = {
    high: tasks.filter(t => t.priority === 'high').length,
    medium: tasks.filter(t => t.priority === 'medium').length,
    low: tasks.filter(t => t.priority === 'low').length,
  };

  const mostRecentTask = tasks.reduce((latest, task) => {
    return new Date(task.updatedAt) > new Date(latest.updatedAt) ? task : latest;
  }, tasks[0]);

  console.log(chalk.bold('Task Statistics'));
  console.log(chalk.gray('─'.repeat(30)));
  console.log();
  console.log(`Total: ${chalk.cyan(total.toString())} task${total !== 1 ? 's' : ''}`);
  console.log();

  console.log('By Status:');
  console.log(`  ● ${chalk.yellow('Todo')}: ${statusCounts.todo}`);
  console.log(`  ● ${chalk.blue('In Progress')}: ${statusCounts['in-progress']}`);
  console.log(`  ● ${chalk.green('Done')}: ${statusCounts.done}`);
  console.log();

  console.log('By Priority:');
  console.log(`  ▲ ${chalk.red('High')}: ${priorityCounts.high}`);
  console.log(`  ● ${chalk.yellow('Medium')}: ${priorityCounts.medium}`);
  console.log(`  ▼ ${chalk.gray('Low')}: ${priorityCounts.low}`);
  console.log();

  console.log(`Last updated: ${chalk.bold(mostRecentTask.title)} (${chalk.gray(mostRecentTask.updatedAt.slice(0, 10))})`);
}
