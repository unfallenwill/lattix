import { Command } from 'commander';
import chalk from 'chalk';
import { loadTasks } from '../store';
import { Task } from '../types';

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .alias('ls')
    .description('List all tasks')
    .option('-s, --status <status>', 'Filter by status (todo/in-progress/done)')
    .option('-p, --priority <priority>', 'Filter by priority (low/medium/high)')
    .action((options) => {
      const { status, priority } = options;

      let tasks = loadTasks();

      // Apply filters
      if (status) {
        const validStatuses = ['todo', 'in-progress', 'done'];
        if (!validStatuses.includes(status)) {
          console.error(chalk.red(`Error: Status must be one of: ${validStatuses.join(', ')}`));
          process.exit(1);
        }
        tasks = tasks.filter((t) => t.status === status);
      }

      if (priority) {
        const validPriorities = ['low', 'medium', 'high'];
        if (!validPriorities.includes(priority)) {
          console.error(chalk.red(`Error: Priority must be one of: ${validPriorities.join(', ')}`));
          process.exit(1);
        }
        tasks = tasks.filter((t) => t.priority === priority);
      }

      // Handle empty list
      if (tasks.length === 0) {
        console.log(chalk.yellow('No tasks found.'));
        return;
      }

      // Display header with padding
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

      // Display each task
      tasks.forEach((task) => {
        // Color-code status
        const statusColored =
          task.status === 'todo'
            ? chalk.yellow(task.status.padEnd(11))
            : task.status === 'in-progress'
              ? chalk.blue(task.status.padEnd(11))
              : chalk.green(task.status.padEnd(11));

        // Color-code priority
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
    });
}
