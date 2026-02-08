#!/usr/bin/env node
import 'reflect-metadata';
import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import { registerCoreServices } from '../composition-root';
import { container } from '../composition-root';
import { ConsoleViewHost } from '../infrastructure/adapters/view/ConsoleViewHost';
import { RunCommand } from './RunCommand';
import { HistoryCommand } from './HistoryCommand';

// Setup DI
registerCoreServices();
container.register('IViewHost', { useClass: ConsoleViewHost });

const program = new Command();

program
    .version('1.0.0')
    .description('Domia CLI - Autonomous Web E2E Testing Agent');

// Banner
console.log(chalk.cyan(figlet.textSync('Domia', { horizontalLayout: 'full' })));

// Register Commands
RunCommand.register(program);
HistoryCommand.register(program);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
    program.outputHelp();
}
