import { Command } from 'commander';
import chalk from 'chalk';
import { loadTasks } from '../store';
import { Task } from '../types';

export function registerSearchCommand(program: Command): void {
  program
    .command('search <query>')
    .alias('s')
    .description('Search tasks by title or description')
    .action((query) => {
      const tasks = loadTasks();
      const searchTerm = query.toLowerCase();

      // Filter tasks by case-insensitive match on title OR description
      const matchingTasks = tasks.filter(
        (task) =>
          task.title.toLowerCase().includes(searchTerm) ||
          (task.description && task.description.toLowerCase().includes(searchTerm))
      );

      // Handle no matches
      if (matchingTasks.length === 0) {
        console.log(chalk.yellow('No matching tasks found.'));
        return;
      }

      // Display match count
      console.log(chalk.cyan(`Found ${matchingTasks.length} task(s)`));
      console.log();

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

      // Display each matching task
      matchingTasks.forEach((task) => {
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
