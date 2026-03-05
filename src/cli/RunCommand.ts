
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
import {
    CLI_DEFAULT_STEPS,
    CLI_DEFAULT_URL,
    DEFAULT_APPIUM_URL,
    DEFAULT_RECORDING_MAX_DURATION_MS,
    DEFAULT_RECORDING_INTERVAL_MS,
} from '../shared/defaults';

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
            .option('--app-package <package>', 'Android app package (e.g., com.example.app)')
            .option('--bundle-id <id>', 'iOS bundle identifier (e.g., com.example.App)')
            .option('--appium-url <url>', `Appium server URL (default: ${DEFAULT_APPIUM_URL})`)
            .option('--device-serial <serial>', 'Android device serial for adb')
            .option('--device-udid <udid>', 'iOS device UDID for Xcode')
            .option('-p, --prompt <prompt>', 'Goal or instruction for the agent')
            .option('-s, --steps <steps>', 'Max steps', String(CLI_DEFAULT_STEPS))
            .option('-H, --no-headless', 'Run in headful mode (visible window)', false)
            .option('--model <model>', 'LLM model name (e.g., gemini-2.0-flash)')
            .option('--api-key <key>', 'LLM API key override for this run')
            .option('--verbose', 'Enable verbose artifact export', false)
            .option('--debug', 'Enable debug logging', false)
            .option('-V, --vision', 'Enable Vision LLM', false)
            .option('-S, --screenshots', 'Enable Debug Screenshots', false)
            .option('--recording', 'Record rapid screenshots during actions for replay', false)
            .option('--recording-max-duration <ms>', `Max recording duration per action in ms (default ${DEFAULT_RECORDING_MAX_DURATION_MS})`, parseInt)
            .option('--recording-interval <ms>', `Screenshot interval during recording in ms (default ${DEFAULT_RECORDING_INTERVAL_MS})`, parseInt)
            .option('--plugin-dir <dir>', 'Plugin directory (default: ~/.domia/plugins)')
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
                    recording,
                    recordingMaxDuration,
                    recordingInterval,
                    cdpUrl,
                    executablePath,
                    launchArgs,
                    windowTitle,
                    appPackage,
                    bundleId,
                    appiumUrl,
                    deviceSerial,
                    deviceUdid,
                    model,
                    apiKey,
                    pluginDir
                } = options;

                const { headless } = options;

                const configService = container.resolve<import('../domain/ports/IConfigService').IConfigService>('IConfigService');
                const currentConfig = configService.get();
                const resolvedModel = model || currentConfig.ai.model;
                const resolvedApiKey = apiKey || currentConfig.ai.apiKey;
                const updates = {
                    ai: {
                        provider: 'google' as const,
                        model: resolvedModel,
                        ...(resolvedApiKey ? { apiKey: resolvedApiKey } : {}),
                        visionEnabled: !!vision,
                        debugScreenshots: !!screenshots
                    }
                };
                configService.update(updates);

                if (model) {
                    console.log(chalk.gray(`[LLM] provider=google model=${resolvedModel}`));
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

                {
                    const { ContainerBuilder: CB } = await import('../composition/ContainerBuilder');
                    await new CB().loadPlugins(pluginDir as string | undefined);
                }

                if ((!url && !cdpUrl && !executablePath && !appPackage && !bundleId) || !prompt) {
                    const answers = await inquirer.prompt([
                        {
                            type: 'input',
                            name: 'url',
                            message: 'Target URL:',
                            default: CLI_DEFAULT_URL,
                            when: !url && !cdpUrl && !executablePath && !appPackage && !bundleId,
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
                            default: CLI_DEFAULT_STEPS,
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
                        appPackage,
                        bundleId,
                        appiumUrl,
                        deviceSerial,
                        deviceUdid,
                    });

                    const platformLabel = url || cdpUrl || executablePath || appPackage || bundleId;

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
                            recording: !!recording,
                            ...(recordingMaxDuration !== undefined ? { recordingMaxDurationMs: recordingMaxDuration as number } : {}),
                            ...(recordingInterval !== undefined ? { recordingIntervalMs: recordingInterval as number } : {}),
                        },
                    };

                    spinner.succeed(`Starting session on ${chalk.green(platformLabel)}`);
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
                            case 'thinking_chunk':
                                process.stdout.write(chalk.gray(event.text));
                                break;
                            case 'replanning': {
                                const status = event.telemetry.status;
                                const reason = event.telemetry.reason;
                                const trigger = event.telemetry.trigger ?? 'unspecified';
                                console.log(chalk.yellow(`[Replanning] status=${status} trigger=${trigger} reason=${reason}`));
                                break;
                            }
                            case 'state_updated': {
                                const state = event.state;
                                if (state.plan) {
                                    const items = state.plan.items;
                                    const activeItem = items.find(i => i.status === 'active');
                                    if (activeItem) {
                                        spinner.text = `Executing: ${activeItem.description}`;
                                    }
                                    if (verbose) {
                                        console.log(chalk.bold('\n  Plan:'));
                                        items.forEach((item, idx) => {
                                            const icon = item.status === 'completed' ? chalk.green('✔')
                                                : item.status === 'active' ? chalk.cyan('▸')
                                                : item.status === 'failed' ? chalk.red('✘')
                                                : chalk.gray('○');
                                            console.log(`    ${icon} ${idx + 1}. ${item.description}${item.error ? chalk.red(` (${item.error})`) : ''}`);
                                        });
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
