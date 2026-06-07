import { Command } from 'commander';
import chalk from 'chalk';
import { generateId, loadTasks, saveTasks } from '../store';
import { Task } from '../types';

export function registerAddCommand(program: Command): void {
  program
    .command('add')
    .description('Add a new task')
    .option('-t, --title <title>', 'Task title (required)')
    .option('-d, --description <description>', 'Task description')
    .option('-p, --priority <priority>', 'Task priority (low/medium/high)', 'medium')
    .action((options) => {
      const { title, description, priority } = options;

      // Validate required title
      if (!title) {
        console.error(chalk.red('Error: Title is required. Use -t or --title to specify a task title.'));
        process.exit(1);
      }

      // Validate priority choices
      const validPriorities = ['low', 'medium', 'high'];
      if (!validPriorities.includes(priority)) {
        console.error(chalk.red(`Error: Priority must be one of: ${validPriorities.join(', ')}`));
        process.exit(1);
      }

      // Load existing tasks
      const tasks = loadTasks();

      // Create new task
      const newTask: Task = {
        id: generateId(),
        title,
        description: description || undefined,
        status: 'todo',
        priority: priority as 'low' | 'medium' | 'high',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Add to tasks array and save
      tasks.push(newTask);
      saveTasks(tasks);

      console.log(chalk.green(`✓ Task added: ${newTask.title} (${newTask.id.slice(0, 8)})`));
    });
}
