#!/usr/bin/env node
import 'reflect-metadata';
import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import { APP_DISPLAY_NAME } from '@shared/defaults';
import { registerCoreServices } from '@backend/container-root';
import { ContainerBuilder } from '@backend/container/ContainerBuilder';
import { RunCommand } from './RunCommand';
import { HistoryCommand } from './HistoryCommand';
import { WorkflowCommand } from './WorkflowCommand';
import { SettingsCommand } from './SettingsCommand';
import { InspectCommand } from './InspectCommand';
import { PluginsCommand } from './PluginsCommand';
import { SkillsCommand } from './SkillsCommand';
import { ShellCommand } from './ShellCommand';

registerCoreServices();
const cliBuilder = new ContainerBuilder();
cliBuilder.initializePlatformProviders();

const program = new Command();

program
    .version('1.0.0')
    .description('Domia CLI - Autonomous Application Agent');

console.log(chalk.cyan(figlet.textSync(APP_DISPLAY_NAME, { horizontalLayout: 'full' })));

RunCommand.register(program);
HistoryCommand.register(program);
WorkflowCommand.register(program);
SettingsCommand.register(program);
InspectCommand.register(program);
PluginsCommand.register(program);
SkillsCommand.register(program);
ShellCommand.register(program);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
    program.outputHelp();
}
