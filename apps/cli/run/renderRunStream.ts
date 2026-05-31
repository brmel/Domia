import { container } from 'tsyringe';
import chalk from 'chalk';
import type { Ora } from 'ora';
import { serializeRunOutput, type RunOutput } from '@backend/dto';
import { createReportWriter, resolveReportFormats } from '../reportUtils';

interface ReportConfig {
    readonly format?: string;
    readonly outputDir?: string;
    readonly configFormat: string;
    readonly configOutputDir: string;
}

interface RenderRunStreamParams {
    readonly generator: AsyncGenerator<RunOutput>;
    readonly jsonMode: boolean;
    readonly verbose: boolean;
    readonly spinner: Ora;
    readonly controls: { teardown(): void };
    readonly report: ReportConfig;
}

/**
 * Drives a run's RunOutput stream to the terminal: NDJSON in --json mode,
 * human-readable (spinner/plan/action lines) otherwise. Owns the report-on-
 * completion and the process.exit codes. Extracted from RunCommand so the
 * command file stays flag-parsing + wiring only.
 */
export async function renderRunStream(params: RenderRunStreamParams): Promise<void> {
    const { generator, jsonMode, verbose, spinner, controls, report } = params;

    let observationUnsubscribe: (() => void) | null = null;
    if (jsonMode) {
        const eventBus = container.resolve<import('@domain/ports/IEventBus').IEventBus>('IEventBus');
        observationUnsubscribe = eventBus.on('observation.frame', (payload) => {
            const out: RunOutput = { type: 'observation', frame: payload.frame };
            process.stdout.write(JSON.stringify(serializeRunOutput(out)) + '\n');
        });
    }

    let capturedRunId: string | undefined;

    for await (const event of generator) {
        if (jsonMode) {
            process.stdout.write(JSON.stringify(serializeRunOutput(event)) + '\n');
            if (event.type === 'started') capturedRunId = event.runId;
            if (event.type === 'completed') {
                observationUnsubscribe?.();
                controls.teardown();
                process.exit(event.success ? 0 : 1);
            }
            if (event.type === 'error') {
                observationUnsubscribe?.();
                controls.teardown();
                process.exit(1);
            }
            if (event.type === 'suspended') {
                observationUnsubscribe?.();
                controls.teardown();
                process.exit(0);
            }
            continue;
        }
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
                controls.teardown();
                if (event.success) {
                    console.log(chalk.green.bold('\n✔ Finished.'));
                    if (event.summary) console.log(chalk.green(event.summary));
                } else {
                    console.log(chalk.red.bold('\n✘ Failed.'));
                    if (event.summary) console.log(chalk.red(event.summary));
                }
                if (capturedRunId) {
                    const effectiveFormat = report.format ?? (report.configFormat !== 'none' ? report.configFormat : undefined);
                    if (effectiveFormat) {
                        const formats = resolveReportFormats(effectiveFormat);
                        const outputDir = report.outputDir ?? report.configOutputDir;
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
                controls.teardown();
                console.log(chalk.red.bold(`\nError: ${event.error}`));
                process.exit(1);
                break;
            case 'suspended':
                controls.teardown();
                console.log(chalk.yellow.bold(`\n⏸  Suspended: ${event.reason}`));
                console.log(chalk.gray(`Resume with: domia run resume ${event.runId}`));
                process.exit(0);
                break;
        }
    }
}
