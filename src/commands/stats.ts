import { Command } from 'commander';
import chalk from 'chalk';
import { loadTasks } from '../store';
import { Task } from '../types';

export function registerStatsCommand(program: Command): void {
  program
    .command('stats')
    .description('Show task statistics')
    .action(() => {
      const tasks = loadTasks();

      // Handle no tasks
      if (tasks.length === 0) {
        console.log(chalk.yellow('No tasks yet. Add some with `taskcli add`!'));
        return;
      }

      // Compute statistics
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

      // Find most recently updated task
      const mostRecentTask = tasks.reduce((latest, task) => {
        return new Date(task.updatedAt) > new Date(latest.updatedAt) ? task : latest;
      }, tasks[0]);

      // Display formatted summary
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
    });
}
