
import { Command } from 'commander';
import { container } from 'tsyringe';
import chalk from 'chalk';
import { IPersistenceAdapter } from '../domain/ports';
import type { IStorageService } from '../domain/ports/IStorageService';
import inquirer from 'inquirer';

export class HistoryCommand {
    static register(program: Command): void {
        const history = program.command('history')
            .description('Manage run history');

        history.command('list')
            .description('List recent runs')
            .option('-l, --limit <limit>', 'Number of runs to show', '20')
            .action(async (options) => {
                const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
                const result = await persistence.getRuns(parseInt(options.limit));

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
                const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
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

                const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
                const stepsResult = await persistence.getSteps(runId);

                if (stepsResult.isErr()) {
                    console.error(chalk.red('Error:', stepsResult.error.message));
                    return;
                }

                const step = stepsResult.value.find(s => s.stepNumber === stepNumber);
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

                const storage = container.resolve<IStorageService>('IStorageService');
                const artifacts = await storage.getStepArtifacts(runId, stepNumber);

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
                const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
                const result = await persistence.getCheckpointRecords(runId);

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

                const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
                const result = await persistence.clearHistory();

                if (result.isErr()) {
                    console.error(chalk.red('Failed to clear history:', result.error.message));
                } else {
                    console.log(chalk.green('History cleared successfully.'));
                }
            });
    }
}
