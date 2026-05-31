
import { Command } from 'commander';
import { container } from 'tsyringe';
import chalk from 'chalk';
import { IPersistenceAdapter } from '@domain/ports';
import type { IStorageService } from '@domain/ports/persistence/IStorageService';
import { CLI_DEFAULT_LIST_LIMIT } from '@shared/defaults';
import { DEFAULT_REPORT_OUTPUT_DIR } from '@shared/defaults/tools.defaults';
import inquirer from 'inquirer';
import { createReportWriter, resolveReportFormats } from './reportUtils';

const getPersistence = () => container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
const getStorage = () => container.resolve<IStorageService>('IStorageService');

export class HistoryCommand {
    static register(program: Command): void {
        const history = program.command('history')
            .description('Manage run history');

        history.command('list')
            .description('List recent runs')
            .option('-l, --limit <limit>', 'Number of runs to show', String(CLI_DEFAULT_LIST_LIMIT))
            .action(async (options) => {
                const result = await getPersistence().getRuns(parseInt(options.limit));

                if (result.isErr()) {
                    console.error(chalk.red('Failed to fetch history:', result.error.message));
                    return;
                }

                const runs = result.value;
                if (runs.length === 0) {
                    console.log(chalk.gray('No history found.'));
                    return;
                }

                console.log(chalk.bold(`\nRecent Runs (${runs.length}):`));
                console.log('--------------------------------------------------');
                runs.forEach(run => {
                    const statusColor = run.status.type === 'passed' ? chalk.green : (run.status.type === 'failed' ? chalk.red : chalk.yellow);
                    console.log(`${chalk.gray(run.id)} | ${statusColor(run.status.type.toUpperCase())} | ${run.url}`);
                    console.log(chalk.dim(`  Goal: ${run.prompt}`));
                    console.log(chalk.dim(`  Time: ${run.startedAt ? run.startedAt.toLocaleString() : 'N/A'}`));
                    console.log('');
                });
            });

        history.command('show <id>')
            .description('Show details of a specific run')
            .action(async (id) => {
                const persistence = getPersistence();
                const runResult = await persistence.getRun(id);

                if (runResult.isErr()) {
                    console.error(chalk.red('Error:', runResult.error.message));
                    return;
                }

                const run = runResult.value;
                if (!run) {
                    console.error(chalk.red('Run not found.'));
                    return;
                }

                const stepsResult = await persistence.getSteps(id);
                const steps = stepsResult.isOk() ? stepsResult.value : [];

                let summary = 'N/A';
                if (run.status.type === 'passed') summary = run.status.summary;
                if (run.status.type === 'failed') summary = run.status.error;
                if (run.status.type === 'cancelled') summary = run.status.reason;

                console.log(chalk.bold(`\nRun Details: ${run.id}`));
                console.log('--------------------------------------------------');
                console.log(`URL: ${chalk.blue(run.url)}`);
                console.log(`Status: ${run.status.type === 'passed' ? chalk.green('PASS') : chalk.red(run.status.type.toUpperCase())}`);
                console.log(`Goal: ${run.prompt}`);
                console.log(`Summary: ${summary}`);
                console.log(`Steps: ${steps.length}`);
                console.log('--------------------------------------------------');

                steps.forEach(step => {
                    console.log(`[${step.stepNumber}] ${chalk.cyan(step.actionType)}`);
                    const thought = 'thought' in step.actionPayload ? step.actionPayload.thought : undefined;
                    if (thought) {
                        console.log(chalk.dim(`    Thought: ${thought}`));
                    }
                });
            });

        history.command('step <runId> <stepNumber>')
            .description('Show detailed step information (params, trace, ARIA, thought)')
            .action(async (runId: string, stepNumberStr: string) => {
                const stepNumber = parseInt(stepNumberStr, 10);
                if (!Number.isFinite(stepNumber) || stepNumber < 1) {
                    console.error(chalk.red('Invalid step number.'));
                    return;
                }

                const stepResult = await getPersistence().getStep(runId, stepNumber);

                if (stepResult.isErr()) {
                    console.error(chalk.red('Error:', stepResult.error.message));
                    return;
                }

                const step = stepResult.value;
                if (!step) {
                    console.error(chalk.red(`Step ${stepNumber} not found in run ${runId}.`));
                    return;
                }

                console.log(chalk.bold(`\nStep ${step.stepNumber}: ${chalk.cyan(step.actionType)}`));
                console.log('--------------------------------------------------');
                console.log(`Timestamp: ${step.timestamp}`);

                const payload = step.actionPayload;
                if ('thought' in payload && payload.thought) {
                    console.log(`Thought: ${chalk.dim(String(payload.thought))}`);
                }

                const params: Record<string, unknown> = {};
                for (const [key, value] of Object.entries(payload)) {
                    if (key !== 'type' && key !== 'thought') params[key] = value;
                }
                if (Object.keys(params).length > 0) {
                    console.log(`Params: ${JSON.stringify(params, null, 2)}`);
                }

                const artifacts = await getStorage().getStepArtifacts(runId, stepNumber);

                if (artifacts.accessibility) {
                    console.log(chalk.bold('\nAccessibility Tree:'));
                    console.log(chalk.gray(artifacts.accessibility));
                }

                if (artifacts.trace) {
                    const trace = artifacts.trace;
                    if (trace.agentInput?.llmLatencyMs) {
                        console.log(`LLM Latency: ${trace.agentInput.llmLatencyMs}ms`);
                    }
                    if (trace.toolCall) {
                        console.log(chalk.bold('\nTool Call:'));
                        console.log(chalk.gray(JSON.stringify(trace.toolCall, null, 2)));
                    }
                    if (trace['toolResult']) {
                        console.log(chalk.bold('\nTool Result:'));
                        console.log(chalk.gray(JSON.stringify(trace['toolResult'], null, 2)));
                    }
                }

                if (artifacts.screenshots?.length) {
                    console.log(chalk.bold(`\nScreenshots: ${artifacts.screenshots.length} file(s)`));
                    artifacts.screenshots.forEach(path => console.log(chalk.dim(`  ${path}`)));
                }
            });

        history.command('checkpoints <runId>')
            .description('Show checkpoint records for a run')
            .action(async (runId: string) => {
                const result = await getPersistence().getCheckpointRecords(runId);

                if (result.isErr()) {
                    console.error(chalk.red('Error:', result.error.message));
                    return;
                }

                const records = result.value;
                if (records.length === 0) {
                    console.log(chalk.gray('No checkpoints found.'));
                    return;
                }

                console.log(chalk.bold(`\nCheckpoints for ${runId} (${records.length}):`));
                console.log('--------------------------------------------------');
                records.forEach((record, index) => {
                    const color = record.reason === 'terminal_success' ? chalk.green
                        : record.reason === 'terminal_failure' ? chalk.red
                        : chalk.cyan;
                    console.log(`[${index + 1}] ${color(record.reason)} — step ${record.state.stepNumber} (${record.state.status})`);
                    console.log(chalk.dim(`    ${record.createdAt}`));
                });
            });

        history.command('export <runId>')
            .description('Export a run report (junit, html, or all)')
            .option('-f, --format <format>', 'Report format: junit, html, all', 'junit')
            .option('-o, --output <dir>', 'Output directory', DEFAULT_REPORT_OUTPUT_DIR)
            .action(async (runId: string, options: { format: string; output: string }) => {
                const formats = resolveReportFormats(options.format);
                try {
                    const writer = createReportWriter();
                    const files = await writer.write(runId, formats, options.output);
                    files.forEach(f => console.log(chalk.green(`Written: ${f}`)));
                } catch (e) {
                    console.error(chalk.red(`Export failed: ${e instanceof Error ? e.message : e}`));
                    process.exit(1);
                }
            });

        history.command('clear')
            .description('Clear all history')
            .option('-f, --force', 'Skip confirmation')
            .action(async (options) => {
                if (!options.force) {
                    const { confirm } = await inquirer.prompt([{
                        type: 'confirm',
                        name: 'confirm',
                        message: 'Are you sure you want to delete ALL history? This cannot be undone.',
                        default: false
                    }]);
                    if (!confirm) return;
                }

                const result = await getPersistence().clearHistory();

                if (result.isErr()) {
                    console.error(chalk.red('Failed to clear history:', result.error.message));
                } else {
                    console.log(chalk.green('History cleared successfully.'));
                }
            });
    }
}
