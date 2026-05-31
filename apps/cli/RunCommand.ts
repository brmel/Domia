import { Command } from 'commander';
import { container } from 'tsyringe';
import ora from 'ora';
import chalk from 'chalk';
import figlet from 'figlet';
import { RunUseCase } from '@backend/runs';
import { ExecutionController } from '@backend/ExecutionController';
import { buildPlatformConfig } from './platformUtils';
import type { ILogger } from '@domain/ports';
import {
    CLI_DEFAULT_STEPS,
    DEFAULT_RECORDING_MAX_DURATION_MS,
    DEFAULT_RECORDING_INTERVAL_MS,
} from '@shared/defaults';
import { parseLogLevel, toLogLevelEnum, type LogLevelChoice } from './run/logLevel';
import { createInteractiveControls } from './run/interactiveControls';
import { promptForMissingRunInputs } from './run/promptForMissingRunInputs';
import { renderRunStream } from './run/renderRunStream';
import { registerReplayCommand } from './run/replayCommand';
import { registerResumeCommand } from './run/resumeCommand';

export class RunCommand {
    static register(program: Command): void {
        program
            .command('run')
            .description('Start an autonomous agent session')
            .option('-u, --url <url>', 'Target URL (Web platform)')
            .option('--platform <platform>', 'Platform type: web, electron')
            .option('--cdp-url <cdpUrl>', 'CDP URL for Electron (e.g., http://localhost:9222)')
            .option('--executable-path <path>', 'Path to Electron executable')
            .option('--launch-args <args...>', 'Launch arguments for Electron (space-separated)')
            .option('--window-title <title>', 'Target window title (Electron)')
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
            .option('--json', 'Emit run events as NDJSON (one JSON object per line, machine-readable)', false)
            .option('--observation-profile <profile>', 'Observation profile: off, on-demand, long-wait, quick-action, high-fidelity')
            .action(async (options) => {
                const jsonMode = !!options.json;
                const log = (msg: string): void => { if (!jsonMode) console.log(msg); };
                if (!jsonMode) {
                    console.log(chalk.cyan(figlet.textSync('Domia Agent', { horizontalLayout: 'full' })));
                }

                let { url, prompt, steps } = options;

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

                const configService = container.resolve<import('@domain/ports/IConfigService').IConfigService>('IConfigService');
                const currentConfig = configService.get();
                const resolvedModel = model || currentConfig.ai.model;
                const resolvedApiKey = apiKey || currentConfig.ai.apiKey;
                configService.updateTransient({
                    ai: {
                        provider: 'google' as const,
                        model: resolvedModel,
                        ...(resolvedApiKey ? { apiKey: resolvedApiKey } : {}),
                        visionEnabled: !!vision,
                        debugScreenshots: !!screenshots,
                    },
                });

                if (shellEnabled === false) {
                    configService.updateTransient({ plugins: { shell: { enabled: false } } });
                    log(chalk.gray('[Shell plugin disabled for this run]'));
                }

                log(chalk.gray(`[LLM] provider=google model=${resolvedModel}`));

                const effectiveLogLevel = debug ? 'debug' as LogLevelChoice : parseLogLevel(logLevelRaw as string);
                const logger = container.resolve<ILogger>('ILogger');
                logger.setLevel(toLogLevelEnum(effectiveLogLevel));

                if (debug) {
                    const debugModule = await import('debug');
                    debugModule.default.enable('domia:*');
                    log(chalk.gray('[Debug Mode Enabled]'));
                }

                if (verbose) {
                    process.env['DOMIA_VERBOSE'] = 'true';
                    log(chalk.gray('[Verbose Mode Enabled: Saving artifacts]'));
                }

                {
                    const { ContainerBuilder: CB } = await import('@backend/container/ContainerBuilder');
                    await new CB().loadPlugins(pluginDir as string | undefined);
                }

                ({ url, prompt, steps } = await promptForMissingRunInputs({
                    url, prompt, steps, cdpUrl, executablePath, platformFlag,
                }));

                const spinner = ora({ text: 'Initializing Agent...', isSilent: jsonMode }).start();

                try {
                    const useCase = container.resolve(RunUseCase);
                    const controller = new ExecutionController();
                    controller.start();
                    const controls = createInteractiveControls(controller, spinner, log);

                    process.on('SIGINT', () => {
                        controls.teardown();
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
                    });

                    const platformLabel = url || cdpUrl || executablePath;

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
                            ...(options.observationProfile ? { observationProfile: options.observationProfile as 'off' | 'on-demand' | 'long-wait' | 'quick-action' | 'high-fidelity' } : {}),
                        },
                    };

                    spinner.succeed(`Starting session on ${chalk.green(platformLabel)}`);
                    log(chalk.gray(`Goal: ${prompt}\n`));

                    controls.setup();

                    const generator = useCase.execute(input, controller);
                    await renderRunStream({
                        generator,
                        jsonMode,
                        verbose: !!verbose,
                        spinner,
                        controls,
                        report: {
                            ...(reportFormat ? { format: reportFormat as string } : {}),
                            ...(reportOutput ? { outputDir: reportOutput as string } : {}),
                            configFormat: currentConfig.reporting.defaultFormat,
                            configOutputDir: currentConfig.reporting.outputDir,
                        },
                    });
                } catch (error) {
                    spinner.fail('Fatal Error');
                    console.error(error);
                    process.exit(1);
                }
            });

        registerReplayCommand(program);
        registerResumeCommand(program);
    }
}
