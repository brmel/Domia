
import { Command } from 'commander';
import { container } from 'tsyringe';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import figlet from 'figlet';
import { RunTestUseCase } from '../application/use-cases';
import { ExecutionController } from '../application/controllers/ExecutionController';
import { ConsoleViewHost } from '../infrastructure/adapters/view/ConsoleViewHost';
import { TraceService } from '../infrastructure/services/TraceService';

export class RunCommand {
    static register(program: Command): void {
        program
            .command('run')
            .description('Start an autonomous test agent session')
            .option('-u, --url <url>', 'Target URL to test (Web platform)')
            .option('--cdp-url <cdpUrl>', 'CDP URL for Electron (e.g., http://localhost:9222)')
            .option('--executable-path <path>', 'Path to Electron executable')
            .option('--launch-args <args>', 'Launch arguments for Electron (comma-separated)')
            .option('--window-title <title>', 'Target window title (Electron)')
            .option('-p, --prompt <prompt>', 'Testing instruction')
            .option('-s, --steps <steps>', 'Max steps', '10')
            .option('-H, --no-headless', 'Run in headful mode (visible browser)', false)
            .option('-V, --vision', 'Enable Vision LLM', false)
            .option('-S, --screenshots', 'Enable Debug Screenshots', false)
            .action(async (options) => {
                console.log(chalk.cyan(figlet.textSync('Domia Agent', { horizontalLayout: 'full' })));

                let { url, prompt, steps, verbose, debug, vision, screenshots, cdpUrl, executablePath, launchArgs, windowTitle } = options;

                const { headless } = options;

                // Update ConfigService with CLI flags
                const configService = container.resolve<import('../domain/ports/IConfigService').IConfigService>('IConfigService');
                const updates = {
                    ai: {
                        visionEnabled: !!vision,
                        debugScreenshots: !!screenshots
                    } as any
                };
                configService.update(updates);

                // 1. Handle Debug Mode (Console Logs)
                if (debug) {
                    const debugModule = await import('debug');
                    debugModule.default.enable('domia:*');
                    console.log(chalk.gray('[Debug Mode Enabled]'));
                }

                // 2. Handle Verbose Mode (File Artifacts)
                if (verbose) {
                    process.env['DOMIA_VERBOSE'] = 'true';
                    const traceService = container.resolve(TraceService);
                    const storage = container.resolve<import('../domain/ports/IStorageService').IStorageService>('IStorageService');
                    const { FileTraceExporter } = await import('../infrastructure/services/exporters/FileTraceExporter');

                    traceService.addExporter(new FileTraceExporter(storage));
                    console.log(chalk.gray('[Verbose Mode Enabled: Saving artifacts]'));
                }

                // Ensure ViewHost is registered
                if (!container.isRegistered('IViewHost')) {
                    container.register('IViewHost', { useClass: ConsoleViewHost });
                }

                // Interactive prompts if needed
                if ((!url && !cdpUrl && !executablePath) || !prompt) {
                    const answers = await inquirer.prompt([
                        {
                            type: 'input',
                            name: 'url',
                            message: 'Target URL:',
                            default: 'https://ibraverse.ca',
                            when: !url && !cdpUrl && !executablePath,
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

                    // Build platform config
                    let platformConfig: any;
                    
                    if (url) {
                        // Web platform
                        platformConfig = {
                            platform: 'web',
                            url,
                            prompt
                        };
                    } else if (cdpUrl) {
                        // Electron CDP mode
                        platformConfig = {
                            platform: 'electron',
                            connection: {
                                type: 'cdp',
                                cdpUrl,
                                ...(windowTitle && { windowTitle })
                            },
                            prompt
                        };
                    } else if (executablePath) {
                        // Electron executable mode
                        const parsedLaunchArgs = launchArgs 
                            ? launchArgs.split(',').map((arg: string) => arg.trim())
                            : [];
                            
                        platformConfig = {
                            platform: 'electron',
                            connection: {
                                type: 'executable',
                                executablePath,
                                launchArgs: parsedLaunchArgs,
                                ...(windowTitle && { windowTitle })
                            },
                            prompt
                        };
                    } else {
                        throw new Error('Must provide either --url, --cdp-url, or --executable-path');
                    }

                    const input = {
                        platformConfig,
                        prompt,
                        options: {
                            maxSteps: parseInt(String(steps), 10),
                            headless: !!headless,
                            vision: !!vision,
                            debugScreenshots: !!screenshots
                        },
                    };

                    spinner.succeed(`Starting session on ${chalk.green(url || cdpUrl || executablePath)}`);
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
