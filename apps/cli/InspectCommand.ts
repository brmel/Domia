import { Command } from 'commander';
import { container } from 'tsyringe';
import chalk from 'chalk';
import { CDP_DEFAULT_URL } from '@shared/defaults';
import type { IAppDriverFactory } from '@domain/ports/automation/IAppDriverFactory';
import { buildPlatformConfig } from './platformUtils';

export class InspectCommand {
    static register(program: Command): void {
        program
            .command('inspect')
            .description('Inspect a running Electron app via CDP. Lists windows, titles, and URLs.')
            .option('--cdp-url <url>', 'CDP URL to connect to', CDP_DEFAULT_URL)
            .action(async (options) => {
                const { cdpUrl } = options;
                console.log(chalk.cyan(`Connecting to ${cdpUrl}...`));

                const factory = container.resolve<IAppDriverFactory>('IAppDriverFactory');
                let driver;
                try {
                    driver = await factory.createDriver({ platformConfig: buildPlatformConfig({ cdpUrl }) });
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    console.error(chalk.red(`Failed to connect: ${msg}`));
                    console.error(chalk.gray('Make sure the Electron app is running with --remote-debugging-port'));
                    process.exit(1);
                }

                try {
                    const windows = driver.getSessionExtras()?.windowManager?.getAllWindows() ?? [];
                    if (windows.length === 0) {
                        console.log(chalk.yellow('No windows found.'));
                    } else {
                        console.log(chalk.green(`\nFound ${windows.length} window(s):\n`));
                        for (const win of windows) {
                            console.log(`  ${chalk.bold(win.title)}`);
                            console.log(`    ID:  ${chalk.gray(win.id)}`);
                            console.log(`    URL: ${chalk.gray(win.url)}`);
                            console.log();
                        }
                    }
                } finally {
                    await driver.disconnect();
                }
            });
    }
}
