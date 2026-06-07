import { Command } from 'commander';
import chalk from 'chalk';
import { loadTasks, saveTasks } from '../store';
import { Task } from '../types';

export function registerUpdateCommand(program: Command): void {
  program
    .command('update <id>')
    .description('Update an existing task')
    .option('-t, --title <title>', 'New task title')
    .option('-d, --description <description>', 'New task description')
    .option('-s, --status <status>', 'New task status (todo/in-progress/done)')
    .option('-p, --priority <priority>', 'New task priority (low/medium/high)')
    .action((id, options) => {
      const { title, description, status, priority } = options;

      // Load existing tasks
      const tasks = loadTasks();

      // Find task by matching first 8 characters of id
      const task = tasks.find((t) => t.id.slice(0, 8) === id.slice(0, 8));

      if (!task) {
        console.error(chalk.red(`Error: Task with ID "${id.slice(0, 8)}" not found.`));
        process.exit(1);
      }

      const changedFields: string[] = [];

      // Validate and update status
      if (status) {
        const validStatuses = ['todo', 'in-progress', 'done'];
        if (!validStatuses.includes(status)) {
          console.error(chalk.red(`Error: Status must be one of: ${validStatuses.join(', ')}`));
          process.exit(1);
        }
        task.status = status as 'todo' | 'in-progress' | 'done';
        changedFields.push(`status → ${chalk.cyan(status)}`);
      }

      // Validate and update priority
      if (priority) {
        const validPriorities = ['low', 'medium', 'high'];
        if (!validPriorities.includes(priority)) {
          console.error(chalk.red(`Error: Priority must be one of: ${validPriorities.join(', ')}`));
          process.exit(1);
        }
        task.priority = priority as 'low' | 'medium' | 'high';
        changedFields.push(`priority → ${chalk.cyan(priority)}`);
      }

      // Update title if provided
      if (title) {
        task.title = title;
        changedFields.push(`title → ${chalk.cyan(title)}`);
      }

      // Update description if provided
      if (description !== undefined) {
        task.description = description || undefined;
        changedFields.push(`description → ${chalk.cyan(description || '(cleared)')}`);
      }

      // Always update updatedAt
      task.updatedAt = new Date().toISOString();

      // Save changes
      saveTasks(tasks);

      console.log(chalk.blue(`Updated task "${chalk.cyan(task.title)}" (${task.id.slice(0, 8)}):`));
      changedFields.forEach((field) => console.log(`  ${field}`));
    });
}
