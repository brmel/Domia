import { Command } from 'commander';
import { container } from 'tsyringe';
import chalk from 'chalk';
import type { IPersistenceAdapter } from '@domain/ports';
import { CLI_DEFAULT_LIST_LIMIT } from '@shared/defaults';
import { unwrapOr } from '../cliResult';

/** workflow run inspection subcommands. */
export function registerWorkflowRunCommands(workflow: Command): void {
    workflow
        .command('runs')
        .description('List workflow runs')
        .option('-l, --limit <limit>', 'Number of workflow runs to show', String(CLI_DEFAULT_LIST_LIMIT))
        .action(async (options) => {
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const limit = parseInt(String(options.limit), 10);
            const runs = unwrapOr(await persistence.getWorkflowRuns(Number.isFinite(limit) ? limit : CLI_DEFAULT_LIST_LIMIT), 'Failed to list workflow runs');
            if (runs === null) return;

            if (runs.length === 0) {
                console.log(chalk.gray('No workflow runs found.'));
                return;
            }

            console.log(chalk.bold('\nWorkflow Runs'));
            console.log('--------------------------------------------------');
            runs.forEach((run) => {
                const statusColor = run.status === 'completed'
                    ? chalk.green
                    : run.status === 'failed'
                        ? chalk.red
                        : run.status === 'cancelled'
                            ? chalk.yellow
                            : chalk.cyan;
                console.log(`${chalk.gray(run.id)} | ${statusColor(run.status.toUpperCase())} | def=${run.workflowDefinitionId} v${run.workflowVersion}`);
                if (run.summary) {
                    console.log(chalk.dim(`  ${run.summary}`));
                }
                console.log(chalk.dim(`  started=${run.startedAt}${run.completedAt ? ` | completed=${run.completedAt}` : ''}`));
                console.log('');
            });
        });

    workflow
        .command('run-details <workflowRunId>')
        .description('Show details for a workflow run and step runs')
        .action(async (workflowRunId: string) => {
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const run = unwrapOr(await persistence.getWorkflowRun(workflowRunId), 'Failed to load workflow run');
            if (!run) {
                console.error(chalk.red('Workflow run not found.'));
                process.exit(1);
            }

            const stepRuns = unwrapOr(await persistence.getWorkflowStepRuns(workflowRunId), 'Failed to load workflow step runs');
            if (stepRuns === null) return;
            console.log(chalk.bold(`\nWorkflow Run ${run.id}`));
            console.log('--------------------------------------------------');
            console.log(`Definition: ${run.workflowDefinitionId}`);
            console.log(`Version: ${run.workflowVersion}`);
            console.log(`Status: ${run.status}`);
            if (run.summary) {
                console.log(`Summary: ${run.summary}`);
            }
            console.log(`Started: ${run.startedAt}`);
            if (run.completedAt) {
                console.log(`Completed: ${run.completedAt}`);
            }

            console.log('\nStep Runs:');
            if (stepRuns.length === 0) {
                console.log(chalk.gray('  No step runs found.'));
                return;
            }

            stepRuns
                .slice()
                .sort((a, b) => a.stepIndex - b.stepIndex)
                .forEach((stepRun) => {
                    console.log(`  [${stepRun.stepIndex + 1}] ${stepRun.stepId} | ${stepRun.status}`);
                    if (stepRun.runId) {
                        console.log(chalk.dim(`      runId: ${stepRun.runId}`));
                    }
                    if (stepRun.summary) {
                        console.log(chalk.dim(`      ${stepRun.summary}`));
                    }
                });
        });
}
