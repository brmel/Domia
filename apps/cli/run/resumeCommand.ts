import { Command } from 'commander';
import { container } from 'tsyringe';
import chalk from 'chalk';
import { ExecutionController } from '@backend/ExecutionController';
import { serializeRunOutput } from '@backend/dto';

export function registerResumeCommand(program: Command): void {
    program
        .command('resume <runId>')
        .description('Resume a previously suspended run')
        .option('--json', 'Emit events as NDJSON', false)
        .action(async (runId: string, options: { json?: boolean }) => {
            const { RunResumeService } = await import('@backend/runs/RunResumeService');
            const resumeService = container.resolve(RunResumeService);
            const controller = new ExecutionController();
            controller.start();
            try {
                for await (const event of resumeService.execute(runId as never, controller)) {
                    if (options.json) {
                        process.stdout.write(JSON.stringify(serializeRunOutput(event)) + '\n');
                        if (event.type === 'completed') process.exit(event.success ? 0 : 1);
                        if (event.type === 'error') process.exit(1);
                        if (event.type === 'suspended') process.exit(0);
                        continue;
                    }
                    if (event.type === 'started') console.log(chalk.cyan(`Resumed run ${event.runId}`));
                    if (event.type === 'acting') console.log(chalk.cyan(`  [Action] ${event.action.type}`));
                    if (event.type === 'suspended') {
                        console.log(chalk.yellow.bold(`\n⏸  Suspended again: ${event.reason}`));
                        console.log(chalk.gray(`Resume with: domia resume ${event.runId}`));
                        process.exit(0);
                    }
                    if (event.type === 'completed') {
                        console.log(event.success ? chalk.green.bold('\n✔ Completed.') : chalk.red.bold('\n✘ Failed.'));
                        if (event.summary) console.log(event.success ? chalk.green(event.summary) : chalk.red(event.summary));
                        process.exit(event.success ? 0 : 1);
                    }
                    if (event.type === 'error') {
                        console.error(chalk.red(`Error: ${event.error.message}`));
                        process.exit(1);
                    }
                }
            } catch (e) {
                console.error(chalk.red(`Resume failed: ${e instanceof Error ? e.message : e}`));
                process.exit(1);
            }
        });
}
