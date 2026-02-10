
import { Command } from 'commander';
import { container } from 'tsyringe';
import chalk from 'chalk';
import { IPersistenceAdapter } from '../domain/ports';
import inquirer from 'inquirer';

export class HistoryCommand {
    static register(program: Command): void {
        const history = program.command('history')
            .description('Manage test run history');

        history.command('list')
            .description('List recent test runs')
            .option('-l, --limit <limit>', 'Number of runs to show', '20')
            .action(async (options) => {
                const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
                const result = await persistence.getTestRuns(parseInt(options.limit));

                if (result.isErr()) {
                    console.error(chalk.red('Failed to fetch history:', result.error.message));
                    return;
                }

                const runs = result.value;
                if (runs.length === 0) {
                    console.log(chalk.gray('No history found.'));
                    return;
                }

                console.log(chalk.bold(`\nRecent Test Runs (${runs.length}):`));
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
            .description('Show details of a specific test run')
            .action(async (id) => {
                const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
                const runResult = await persistence.getTestRun(id);

                if (runResult.isErr()) {
                    console.error(chalk.red('Error:', runResult.error.message));
                    return;
                }

                const run = runResult.value;
                if (!run) {
                    console.error(chalk.red('Test run not found.'));
                    return;
                }

                const stepsResult = await persistence.getTestSteps(id);
                const steps = stepsResult.isOk() ? stepsResult.value : [];

                // Extract summary based on status
                let summary = 'N/A';
                if (run.status.type === 'passed') summary = run.status.summary;
                if (run.status.type === 'failed') summary = run.status.error;
                if (run.status.type === 'cancelled') summary = run.status.reason;

                console.log(chalk.bold(`\nTest Run Details: ${run.id}`));
                console.log('--------------------------------------------------');
                console.log(`URL: ${chalk.blue(run.url)}`);
                console.log(`Status: ${run.status.type === 'passed' ? chalk.green('PASS') : chalk.red(run.status.type.toUpperCase())}`);
                console.log(`Goal: ${run.prompt}`);
                console.log(`Summary: ${summary}`);
                console.log(`Steps: ${steps.length}`);
                console.log('--------------------------------------------------');

                steps.forEach(step => {
                    console.log(`[${step.stepNumber}] ${chalk.cyan(step.actionType)}`);
                    if (step.actionPayload && (step.actionPayload as any).thought) {
                        console.log(chalk.dim(`    Thought: ${(step.actionPayload as any).thought}`));
                    }
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
