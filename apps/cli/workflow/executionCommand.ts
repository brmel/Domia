import { Command } from 'commander';
import { container } from 'tsyringe';
import chalk from 'chalk';
import { ExecutionController } from '@backend/ExecutionController';
import { WorkflowRunOrchestratorService } from '@backend/workflows/WorkflowRunOrchestratorService';

/** workflow execution (streams events to the console). */
export function registerWorkflowExecutionCommand(workflow: Command): void {
    workflow
        .command('start <workflowDefinitionId>')
        .description('Start workflow execution and stream events')
        .action(async (workflowDefinitionId: string) => {
            const executionService = container.resolve(WorkflowRunOrchestratorService);
            const controller = new ExecutionController();
            controller.start();

            process.on('SIGINT', () => {
                console.log(chalk.yellow('\nStopping workflow...'));
                controller.stop();
            });

            try {
                for await (const event of executionService.executeWorkflow(workflowDefinitionId, controller)) {
                    switch (event.type) {
                        case 'workflow_started':
                            console.log(chalk.cyan(`Workflow started: ${event.workflowRunId}`));
                            break;
                        case 'workflow_step_started':
                            console.log(chalk.gray(`Step ${event.stepIndex + 1} started (${event.stepId})`));
                            break;
                        case 'workflow_step_bound':
                            console.log(chalk.gray(`Step ${event.stepIndex + 1} run: ${event.runId}`));
                            break;
                        case 'workflow_step_completed':
                            console.log(event.success
                                ? chalk.green(`Step ${event.stepIndex + 1} completed${event.summary ? `: ${event.summary}` : ''}`)
                                : chalk.red(`Step ${event.stepIndex + 1} failed${event.summary ? `: ${event.summary}` : ''}`));
                            break;
                        case 'workflow_completed':
                            console.log(event.success
                                ? chalk.green.bold(`Workflow completed${event.summary ? `: ${event.summary}` : ''}`)
                                : chalk.red.bold(`Workflow failed${event.summary ? `: ${event.summary}` : ''}`));
                            process.exit(event.success ? 0 : 1);
                            break;
                        case 'workflow_failed':
                            console.log(chalk.red.bold(`Workflow failed: ${event.reason}`));
                            process.exit(1);
                            break;
                    }
                }
            } catch (error) {
                console.error(chalk.red(`Workflow execution error: ${String(error)}`));
                process.exit(1);
            }
        });
}
