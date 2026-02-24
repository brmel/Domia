#!/usr/bin/env node
import 'reflect-metadata';
import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import { registerCoreServices } from '../composition-root';
import { initializePlatformProviders } from '../composition/modules/registerPlatformModule';
import { registerCliViewHost } from '../composition/modules/registerCliModule';
import { RunCommand } from './RunCommand';
import { HistoryCommand } from './HistoryCommand';
import { WorkflowCommand } from './WorkflowCommand';

registerCoreServices();
registerCliViewHost();
initializePlatformProviders();

const program = new Command();

program
    .version('1.0.0')
    .description('Domia CLI - Autonomous Web E2E Testing Agent');

console.log(chalk.cyan(figlet.textSync('Domia', { horizontalLayout: 'full' })));

RunCommand.register(program);
HistoryCommand.register(program);
WorkflowCommand.register(program);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
    program.outputHelp();
}
