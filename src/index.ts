#!/usr/bin/env node
import { Command } from 'commander';
import { registerAddCommand } from './commands/add';
import { registerListCommand } from './commands/list';
import { registerUpdateCommand } from './commands/update';
import { registerDeleteCommand } from './commands/delete';
import { registerSearchCommand } from './commands/search';
import { registerStatsCommand } from './commands/stats';
import { registerInteractiveCommand } from './commands/interactive';

const program = new Command();

program
  .name('taskcli')
  .version('1.0.0')
  .description('A beautiful CLI task manager');

registerAddCommand(program);
registerListCommand(program);
registerUpdateCommand(program);
registerDeleteCommand(program);
registerSearchCommand(program);
registerStatsCommand(program);
registerInteractiveCommand(program);

program.parse(process.argv);
