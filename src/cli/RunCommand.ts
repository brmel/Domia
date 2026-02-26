
import { Command } from 'commander';
import { container } from 'tsyringe';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import figlet from 'figlet';
import readline from 'readline';
import { RunUseCase } from '../application/use-cases';
import { ExecutionController } from '../application/controllers/ExecutionController';
import { RunState } from '../domain/enums/RunState';
import { configureVerboseTracing } from '../composition/ContainerBuilder';
import { buildPlatformConfig } from './platformUtils';

export class RunCommand {
    static register(program: Command): void {
        program
            .command('run')
            .description('Start an autonomous agent session')
            .option('-u, --url <url>', 'Target URL (Web platform)')
            .option('--cdp-url <cdpUrl>', 'CDP URL for Electron (e.g., http://localhost:9222)')
            .option('--executable-path <path>', 'Path to Electron executable')
            .option('--launch-args <args>', 'Launch arguments for Electron (comma-separated)')
            .option('--window-title <title>', 'Target window title (Electron)')
            .option('-p, --prompt <prompt>', 'Goal or instruction for the agent')
            .option('-s, --steps <steps>', 'Max steps', '10')
            .option('-H, --no-headless', 'Run in headful mode (visible window)', false)
            .option('--provider <provider>', 'LLM provider: google')
            .option('--model <model>', 'LLM model name (e.g., gemini-2.0-flash)')
            .option('--base-url <url>', 'LLM base URL override')
            .option('--api-key <key>', 'LLM API key override for this run')
            .option('--verbose', 'Enable verbose artifact export', false)
            .option('--debug', 'Enable debug logging', false)
            .option('-V, --vision', 'Enable Vision LLM', false)
            .option('-S, --screenshots', 'Enable Debug Screenshots', false)
            .action(async (options) => {
                console.log(chalk.cyan(figlet.textSync('Domia Agent', { horizontalLayout: 'full' })));

                let {
                    url,
                    prompt,
                    steps
                } = options;

                const {
                    verbose,
                    debug,
                    vision,
                    screenshots,
                    cdpUrl,
                    executablePath,
                    launchArgs,
                    windowTitle,
                    provider,
                    model,
                    baseUrl,
                    apiKey
                } = options;

                const { headless } = options;

                const configService = container.resolve<import('../domain/ports/IConfigService').IConfigService>('IConfigService');
                const currentConfig = configService.get();
                const resolvedProvider = provider || currentConfig.ai.provider;
                const resolvedModel = model || currentConfig.ai.model;
                const resolvedBaseUrl = baseUrl || currentConfig.ai.baseUrl;
                const resolvedApiKey = apiKey || currentConfig.ai.apiKey;
                const updates = {
                    ai: {
                        provider: resolvedProvider,
                        model: resolvedModel,
                        ...(resolvedApiKey ? { apiKey: resolvedApiKey } : {}),
                        ...(resolvedBaseUrl ? { baseUrl: resolvedBaseUrl } : {}),
                        visionEnabled: !!vision,
                        debugScreenshots: !!screenshots
                    }
                };
                configService.update(updates);

                if (provider || model || baseUrl) {
                    console.log(chalk.gray(`[LLM] provider=${resolvedProvider} model=${resolvedModel}${resolvedBaseUrl ? ` baseUrl=${resolvedBaseUrl}` : ''}`));
                }

                if (debug) {
                    const debugModule = await import('debug');
                    debugModule.default.enable('domia:*');
                    console.log(chalk.gray('[Debug Mode Enabled]'));
                }

                if (verbose) {
                    process.env['DOMIA_VERBOSE'] = 'true';
                    configureVerboseTracing();
                    console.log(chalk.gray('[Verbose Mode Enabled: Saving artifacts]'));
                }

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
                    const useCase = container.resolve(RunUseCase);
                    const controller = new ExecutionController();
                    let interactiveKeyHandler: ((str: string, key: readline.Key) => void) | null = null;
                    let rawModeEnabled = false;

                    const teardownInteractiveControls = (): void => {
                        if (interactiveKeyHandler) {
                            process.stdin.off('keypress', interactiveKeyHandler);
                            interactiveKeyHandler = null;
                        }

                        if (rawModeEnabled && process.stdin.isTTY) {
                            process.stdin.setRawMode(false);
                        }

                        if (process.stdin.isTTY) {
                            process.stdin.pause();
                        }
                        rawModeEnabled = false;
                    };

                    const setupInteractiveControls = (): void => {
                        if (!process.stdin.isTTY) {
                            return;
                        }

                        readline.emitKeypressEvents(process.stdin);
                        process.stdin.setRawMode(true);
                        process.stdin.resume();
                        rawModeEnabled = true;

                        console.log(chalk.gray('Controls: [p] pause/resume, [s] stop, [q] quit'));

                        interactiveKeyHandler = (_str: string, key: readline.Key): void => {
                            if (key.ctrl && key.name === 'c') {
                                teardownInteractiveControls();
                                spinner.stop();
                                console.log(chalk.yellow('\nStopping agent...'));
                                controller.stop();
                                process.exit(0);
                            }

                            if (key.name === 'p') {
                                if (controller.state === RunState.PAUSED) {
                                    controller.resume();
                                    console.log(chalk.cyan('\n⏯ Resumed'));
                                } else {
                                    controller.pause();
                                    console.log(chalk.cyan('\n⏸ Paused'));
                                }
                            }

                            if (key.name === 's' || key.name === 'q') {
                                teardownInteractiveControls();
                                spinner.stop();
                                console.log(chalk.yellow('\nStopping agent...'));
                                controller.stop();
                            }
                        };

                        process.stdin.on('keypress', interactiveKeyHandler);
                    };

                    process.on('SIGINT', () => {
                        teardownInteractiveControls();
                        spinner.stop();
                        console.log(chalk.yellow('\nStopping agent...'));
                        controller.stop();
                        process.exit(0);
                    });

                    const platformConfig = buildPlatformConfig({
                        url,
                        cdpUrl,
                        executablePath,
                        launchArgs,
                        windowTitle,
                    });

                    const input = {
                        platformConfig,
                        prompt,
                        options: {
                            maxSteps: parseInt(String(steps), 10),
                            headless: !!headless,
                            verbose: !!verbose,
                            debug: !!debug,
                            vision: !!vision,
                            debugScreenshots: !!screenshots,
                        },
                    };

                    spinner.succeed(`Starting session on ${chalk.green(url || cdpUrl || executablePath)}`);
                    console.log(chalk.gray(`Goal: ${prompt}\n`));

                    setupInteractiveControls();

                    const generator = useCase.execute(input, controller);

                    for await (const event of generator) {
                        switch (event.type) {
                            case 'started':
                                break;
                            case 'acting': {
                                const a = event.action;
                                const thought = 'thought' in a ? (a as { thought?: string }).thought : undefined;
                                console.log(chalk.cyan(`  [Action] ${a.type}`) + (thought ? chalk.dim(` — ${thought}`) : ''));
                                break;
                            }
                            case 'replanning': {
                                const status = event.telemetry.status;
                                const reason = event.telemetry.reason;
                                const trigger = event.telemetry.trigger ?? 'unspecified';
                                console.log(chalk.yellow(`[Replanning] status=${status} trigger=${trigger} reason=${reason}`));
                                break;
                            }
                            case 'recovery_replay': {
                                console.log(
                                    chalk.magenta(
                                        `[Recovery] status=${event.telemetry.status} sourceRun=${event.telemetry.sourceRunId} replayed=${event.telemetry.replayedCount}`
                                    )
                                );
                                break;
                            }
                            case 'state_updated': {
                                const state = event.state;
                                if (state.plan) {
                                    const activeItem = state.plan.items.find(i => i.status === 'active');
                                    if (activeItem) {
                                        spinner.text = `Executing: ${activeItem.description}`;
                                    }
                                }
                                break;
                            }
                            case 'completed':
                                teardownInteractiveControls();
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
                                teardownInteractiveControls();
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
