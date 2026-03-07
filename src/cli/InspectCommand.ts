import { Command } from 'commander';
import chalk from 'chalk';
import { chromium } from 'playwright';
import { CDP_CONSTANTS } from '../domain/PlatformConstants';

export class InspectCommand {
    static register(program: Command): void {
        program
            .command('inspect')
            .description('Inspect a running Electron app via CDP. Lists windows, titles, and URLs.')
            .option('--cdp-url <url>', 'CDP URL to connect to', CDP_CONSTANTS.DEFAULT_URL)
            .option('--timeout <ms>', 'Connection timeout in ms', String(CDP_CONSTANTS.CONNECTION_TIMEOUT_MS))
            .action(async (options) => {
                const { cdpUrl, timeout } = options;
                const timeoutMs = parseInt(String(timeout), 10);

                console.log(chalk.cyan(`Connecting to ${cdpUrl}...`));

                let browser;
                try {
                    browser = await chromium.connectOverCDP(cdpUrl, { timeout: timeoutMs });
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    console.error(chalk.red(`Failed to connect: ${msg}`));
                    console.error(chalk.gray('Make sure the Electron app is running with --remote-debugging-port'));
                    process.exit(1);
                }

                const windows: { title: string; url: string; context: number; page: number }[] = [];

                for (const [ci, context] of browser.contexts().entries()) {
                    for (const [pi, page] of context.pages().entries()) {
                        const title = await page.title().catch(() => '(unknown)');
                        const url = page.url();
                        windows.push({ title, url, context: ci, page: pi });
                    }
                }

                if (windows.length === 0) {
                    console.log(chalk.yellow('No windows found.'));
                } else {
                    console.log(chalk.green(`\nFound ${windows.length} window(s):\n`));
                    for (const win of windows) {
                        console.log(`  ${chalk.bold(win.title)}`);
                        console.log(`    URL:     ${chalk.gray(win.url)}`);
                        console.log(`    Context: ${win.context}, Page: ${win.page}`);
                        console.log();
                    }
                }

                await browser.close();
            });
    }
}
