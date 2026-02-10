
import { Command } from 'commander';
import { container } from 'tsyringe';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import figlet from 'figlet';
import { RunTestUseCase } from '../application/use-cases';
import { ExecutionController } from '../application/controllers/ExecutionController';
import { ConsoleViewHost } from '../infrastructure/adapters/view/ConsoleViewHost';

export class RunCommand {
    static register(program: Command): void {
        program
            .command('run')
            .description('Start an autonomous test agent session')
            .option('-u, --url <url>', 'Target URL to test')
            .option('-p, --prompt <prompt>', 'Testing instruction')
            .option('-s, --steps <steps>', 'Max steps', '10')
            .option('-H, --no-headless', 'Run in headful mode (visible browser)', false)
            .option('-v, --verbose', 'Enable detailed artifact recording (DOM, Screenshots)', false)
            .option('-d, --debug', 'Enable debug console output', false)
            .action(async (options) => {
                console.log(chalk.cyan(figlet.textSync('Domia Agent', { horizontalLayout: 'full' })));

                let { url, prompt, steps, verbose, debug } = options;
                const { headless } = options;

                // 1. Handle Debug Mode (Console Logs)
                if (debug) {
                    const debugModule = await import('debug');
                    debugModule.default.enable('domia:*');
                    console.log(chalk.gray('[Debug Mode Enabled]'));
                }

                // 2. Handle Verbose Mode (File Artifacts)
                if (verbose) {
                    process.env['DOMIA_VERBOSE'] = 'true';
                    const traceService = container.resolve<import('../infrastructure/services/TraceService').TraceService>('ITraceService');
                    const storage = container.resolve<import('../domain/ports/IStorageService').IStorageService>('IStorageService');
                    const { FileTraceExporter } = await import('../infrastructure/services/exporters/FileTraceExporter');

                    // Avoid duplicate if env var was already set
                    // But since we can't easily check internal state, strictly speaking this might duplicate if env var was ALSO set. 
                    // However, for CLI usage usually one or the other. 
                    // Let's assume if it was set in env, it was registered in composition root.
                    // If it wasn't set in env (which is why they passed the flag), we register it now.
                    if (process.env['DOMIA_VERBOSE_INIT'] !== 'true') { // We can't check init state easily.
                        // Simple check: we just add it. If user sets BOTH env var and flag, they might get double writes, which is acceptable edge case for now.
                        // Actually, composition root checks logic is: `if (process.env['DOMIA_VERBOSE'] === 'true')`. 
                        // If we didn't start with it, it's not there.
                        traceService.addExporter(new FileTraceExporter(storage));
                        console.log(chalk.gray('[Verbose Mode Enabled: Saving artifacts]'));
                    }
                }

                // Ensure ViewHost is registered
                if (!container.isRegistered('IViewHost')) {
                    container.register('IViewHost', { useClass: ConsoleViewHost });
                }

                if (!url || !prompt) {
                    const answers = await inquirer.prompt([
                        {
                            type: 'input',
                            name: 'url',
                            message: 'Target URL:',
                            default: 'https://google.com',
                            when: !url,
                        },
                        {
                            type: 'input',
                            name: 'prompt',
                            message: 'What should the agent do?',
                            when: !prompt,
                        },
                        {
                            type: 'number',
                            name: 'steps',
                            message: 'Max steps:',
                            default: 10,
                            when: !steps,
                        }
                    ]);
                    url = url || answers.url;
                    prompt = prompt || answers.prompt;
                    steps = steps || answers.steps;
                }

                const spinner = ora('Initializing Agent...').start();

                try {
                    const useCase = container.resolve(RunTestUseCase);
                    const controller = new ExecutionController();

                    // Handle Ctrl+C
                    process.on('SIGINT', () => {
                        spinner.stop();
                        console.log(chalk.yellow('\nStopping agent...'));
                        controller.stop();
                        process.exit(0);
                    });

                    const input = {
                        url,
                        prompt,
                        options: {
                            maxSteps: parseInt(String(steps), 10),
                            headless: !!headless,
                        },
                    };

                    spinner.succeed(`Starting session on ${chalk.green(url)}`);
                    console.log(chalk.gray(`Goal: ${prompt}\n`));

                    const generator = useCase.execute(input, controller);

                    for await (const event of generator) {
                        switch (event.type) {
                            case 'started':
                                break;
                            case 'state_updated':
                                const state = event.state;
                                if (state.plan) {
                                    // Simple visualization of plan progress
                                    // For CLI, maybe just log the active item?
                                    const activeItem = state.plan.items.find(i => i.status === 'active');
                                    if (activeItem) {
                                        spinner.text = `Executing: ${activeItem.description}`;
                                    }
                                }
                                break;
                            case 'completed':
                                if (event.success) {
                                    console.log(chalk.green.bold('\n✔ Mission Accomplished!'));
                                    if (event.summary) console.log(chalk.green(event.summary));
                                } else {
                                    console.log(chalk.red.bold('\n✘ Mission Failed.'));
                                    if (event.summary) console.log(chalk.red(event.summary));
                                }
                                process.exit(event.success ? 0 : 1);
                                break;
                            case 'error':
                                console.log(chalk.red.bold(`\nError: ${event.error}`));
                                process.exit(1);
                                break;
                        }
                    }

                } catch (error) {
                    spinner.fail('Fatal Error');
                    console.error(error);
                    process.exit(1);
                }
            });
    }
}
