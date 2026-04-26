import { Command } from 'commander';
import { container } from 'tsyringe';
import chalk from 'chalk';
import { PluginsAppService } from '@backend/plugins/PluginsAppService';
import { ContainerBuilder } from '@backend/container/ContainerBuilder';

export class PluginsCommand {
    static register(program: Command): void {
        const plugins = program.command('plugins').description('Manage plugins');

        plugins
            .command('list')
            .description('List loaded plugins')
            .option('--plugin-dir <dir>', 'Plugin directory (default: ~/.domia/plugins)')
            .action(async (opts) => {
                await new ContainerBuilder().loadPlugins(opts.pluginDir);
                const list = container.resolve(PluginsAppService).list();
                if (list.length === 0) {
                    console.log(chalk.gray('No plugins loaded.'));
                    return;
                }
                for (const p of list) {
                    const badge = p.enabled ? chalk.green('enabled ') : chalk.gray('disabled');
                    console.log(`${badge} ${chalk.bold(p.name)}  ${chalk.gray(p.toolNames.join(', '))}`);
                }
            });

        plugins
            .command('enable <name>')
            .description('Enable a built-in plugin (currently: shell)')
            .action((name: string) => {
                if (name !== 'shell') {
                    console.error(chalk.red(`Unknown plugin: ${name}. Built-ins: shell.`));
                    process.exit(1);
                }
                container.resolve(PluginsAppService).setShellEnabled(true);
                console.log(chalk.green(`Enabled plugin: ${name}`));
            });

        plugins
            .command('disable <name>')
            .description('Disable a built-in plugin (currently: shell)')
            .action((name: string) => {
                if (name !== 'shell') {
                    console.error(chalk.red(`Unknown plugin: ${name}. Built-ins: shell.`));
                    process.exit(1);
                }
                container.resolve(PluginsAppService).setShellEnabled(false);
                console.log(chalk.yellow(`Disabled plugin: ${name}`));
            });
    }
}
