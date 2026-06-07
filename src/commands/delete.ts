import { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'readline';
import { loadTasks, saveTasks } from '../store';

export function registerDeleteCommand(program: Command): void {
  program
    .command('delete <id>')
    .alias('rm')
    .description('Delete a task')
    .option('-f, --force', 'Skip confirmation prompt')
    .action((id, options) => {
      const { force } = options;

      // Load existing tasks
      let tasks = loadTasks();

      // Find task by matching first 8 characters of id
      const taskIndex = tasks.findIndex((t) => t.id.slice(0, 8) === id.slice(0, 8));

      if (taskIndex === -1) {
        console.error(chalk.red(`Error: Task with ID "${id.slice(0, 8)}" not found.`));
        process.exit(1);
      }

      const task = tasks[taskIndex];

      // Confirmation prompt (unless --force is set)
      if (!force) {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const question = (query: string): Promise<boolean> => {
          return new Promise((resolve) => {
            rl.question(query, (answer) => {
              rl.close();
              resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
            });
          });
        };

        question(`Are you sure you want to delete "${task.title}"? (y/N) `).then((confirmed) => {
          if (!confirmed) {
            console.log(chalk.yellow('Deletion cancelled.'));
            process.exit(0);
          }

          // Remove task from array
          tasks.splice(taskIndex, 1);
          saveTasks(tasks);

          console.log(chalk.red(`Deleted: ${task.title} (${task.id.slice(0, 8)})`));
        });

        return;
      }

      // If --force is set, delete without confirmation
      tasks.splice(taskIndex, 1);
      saveTasks(tasks);

      console.log(chalk.red(`Deleted: ${task.title} (${task.id.slice(0, 8)})`));
    });
}
