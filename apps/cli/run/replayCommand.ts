import { Command } from 'commander';
import { container } from 'tsyringe';
import chalk from 'chalk';
import { RunUseCase } from '@backend/runs';
import { ExecutionController } from '@backend/ExecutionController';

export function registerReplayCommand(program: Command): void {
    program
        .command('replay <runId>')
        .description('Re-run an existing run, optionally with a new prompt')
        .option('--prompt <prompt>', 'Override the prompt for this replay')
        .action(async (runId: string, options: { prompt?: string }) => {
            const { RunReplayService } = await import('@backend/runs/RunReplayService');
            const replayService = container.resolve(RunReplayService);
            const useCase = container.resolve(RunUseCase);
            const controller = new ExecutionController();
            controller.start();
            try {
                const built = await replayService.build(runId, options.prompt ? { promptOverride: options.prompt } : {});
                console.log(chalk.gray(`Replaying ${runId} → new run`));
                for await (const event of useCase.execute(built.input, controller)) {
                    if (event.type === 'started') console.log(chalk.cyan(`Started: ${event.runId}`));
                    if (event.type === 'completed') {
                        console.log(event.success ? chalk.green('Completed') : chalk.red(`Failed: ${event.summary ?? ''}`));
                        process.exit(event.success ? 0 : 1);
                    }
                    if (event.type === 'error') {
                        console.error(chalk.red(`Error: ${event.error.message}`));
                        process.exit(1);
                    }
                }
            } catch (e) {
                console.error(chalk.red(`Replay failed: ${e instanceof Error ? e.message : e}`));
                process.exit(1);
            }
        });
}
