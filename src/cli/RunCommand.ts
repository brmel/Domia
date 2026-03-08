
import { Command } from 'commander';
import { container } from 'tsyringe';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import figlet from 'figlet';
import readline from 'readline';
import { RunUseCase } from '../application/use-cases';
import { ExecutionController } from '../application/ExecutionController';
import { RunState, LogLevel } from '../domain/enums';
import { buildPlatformConfig } from './platformUtils';
import type { ILogger } from '../domain/ports';
import {
    CLI_DEFAULT_STEPS,
    CLI_DEFAULT_URL,
    DEFAULT_APPIUM_URL,
    DEFAULT_RECORDING_MAX_DURATION_MS,
    DEFAULT_RECORDING_INTERVAL_MS,
} from '../shared/defaults';
import { createReportWriter, resolveReportFormats } from './reportUtils';

const LOG_LEVEL_CHOICES = ['error', 'warn', 'info', 'debug'] as const;
type LogLevelChoice = typeof LOG_LEVEL_CHOICES[number];

function parseLogLevel(value: string): LogLevelChoice {
    const lower = value.toLowerCase() as LogLevelChoice;
    if (!LOG_LEVEL_CHOICES.includes(lower)) {
        throw new Error(`Invalid log level: ${value}. Must be one of: ${LOG_LEVEL_CHOICES.join(', ')}`);
    }
    return lower;
}

function toLogLevelEnum(level: LogLevelChoice): LogLevel {
    const map: Record<LogLevelChoice, LogLevel> = {
        error: LogLevel.ERROR,
        warn: LogLevel.WARN,
        info: LogLevel.INFO,
        debug: LogLevel.DEBUG,
    };
    return map[level];
}

export class RunCommand {
    static register(program: Command): void {
        program
            .command('run')
            .description('Start an autonomous agent session')
            .option('-u, --url <url>', 'Target URL (Web platform)')
            .option('--platform <platform>', 'Platform type: web, electron, android, ios')
            .option('--cdp-url <cdpUrl>', 'CDP URL for Electron (e.g., http://localhost:9222)')
            .option('--executable-path <path>', 'Path to Electron executable')
            .option('--launch-args <args...>', 'Launch arguments for Electron (space-separated)')
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
            .option('--log-level <level>', 'Log level: error, warn, info, debug', 'info')
            .option('--verbose', 'Enable verbose artifact export', false)
            .option('--debug', 'Enable debug logging', false)
            .option('-V, --vision', 'Enable Vision LLM', false)
            .option('-S, --screenshots', 'Enable Debug Screenshots', false)
            .option('--recording', 'Record rapid screenshots during actions for replay', false)
            .option('--recording-max-duration <ms>', `Max recording duration per action in ms (default ${DEFAULT_RECORDING_MAX_DURATION_MS})`, parseInt)
            .option('--recording-interval <ms>', `Screenshot interval during recording in ms (default ${DEFAULT_RECORDING_INTERVAL_MS})`, parseInt)
            .option('--plugin-dir <dir>', 'Plugin directory (default: ~/.domia/plugins)')
            .option('--no-shell', 'Disable the shell_exec plugin for this run')
            .option('--report <format>', 'Generate report after run: junit, html, all')
            .option('--report-output <dir>', 'Report output directory')
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
                    pluginDir,
                    logLevel: logLevelRaw,
                    platform: platformFlag,
                    shell: shellEnabled,
                    report: reportFormat,
                    reportOutput,
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
                configService.updateTransient(updates);

                if (shellEnabled === false) {
                    configService.updateTransient({ plugins: { shell: { enabled: false } } });
                    console.log(chalk.gray('[Shell plugin disabled for this run]'));
                }

                console.log(chalk.gray(`[LLM] provider=google model=${resolvedModel}`));

                const effectiveLogLevel = debug ? 'debug' as LogLevelChoice : parseLogLevel(logLevelRaw as string);
                const logger = container.resolve<ILogger>('ILogger');
                logger.setLevel(toLogLevelEnum(effectiveLogLevel));

                if (debug) {
                    const debugModule = await import('debug');
                    debugModule.default.enable('domia:*');
                    console.log(chalk.gray('[Debug Mode Enabled]'));
                }

                if (verbose) {
                    process.env['DOMIA_VERBOSE'] = 'true';
                    console.log(chalk.gray('[Verbose Mode Enabled: Saving artifacts]'));
                }

                {
                    const { ContainerBuilder: CB } = await import('../composition/ContainerBuilder');
                    await new CB().loadPlugins(pluginDir as string | undefined);
                }

                if ((!url && !cdpUrl && !executablePath && !appPackage && !bundleId && !platformFlag) || !prompt) {
                    const answers = await inquirer.prompt([
                        {
                            type: 'list',
                            name: 'platformChoice',
                            message: 'Select platform:',
                            choices: ['web', 'electron (CDP)', 'electron (executable)'],
                            when: !url && !cdpUrl && !executablePath && !appPackage && !bundleId && !platformFlag,
                        },
                        {
                            type: 'input',
                            name: 'url',
                            message: 'Target URL:',
                            default: CLI_DEFAULT_URL,
                            when: (ans: Record<string, unknown>) => !url && !cdpUrl && !executablePath && !appPackage && !bundleId && (!platformFlag || platformFlag === 'web') && (ans['platformChoice'] === 'web' || !ans['platformChoice']),
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
                    url = url || answers['url'];
                    prompt = prompt || answers['prompt'];
                    steps = steps || answers['steps'];
                }

                const spinner = ora('Initializing Agent...').start();

                try {
                    const useCase = container.resolve(RunUseCase);
                    const controller = new ExecutionController();
                    controller.start();
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
                        platform: platformFlag,
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
                    let capturedRunId: string | undefined;

                    for await (const event of generator) {
                        switch (event.type) {
                            case 'started':
                                capturedRunId = event.runId;
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
                                if (capturedRunId) {
                                    const configReportFormat = currentConfig.reporting.defaultFormat;
                                    const effectiveFormat = reportFormat ?? (configReportFormat !== 'none' ? configReportFormat : undefined);
                                    if (effectiveFormat) {
                                        const formats = resolveReportFormats(effectiveFormat);
                                        const outputDir = reportOutput ?? currentConfig.reporting.outputDir;
                                        try {
                                            const writer = createReportWriter();
                                            const files = await writer.write(capturedRunId, formats, outputDir);
                                            files.forEach(f => console.log(chalk.gray(`Report: ${f}`)));
                                        } catch (e) {
                                            console.error(chalk.yellow(`Warning: report generation failed: ${e instanceof Error ? e.message : e}`));
                                        }
                                    }
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
