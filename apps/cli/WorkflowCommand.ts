import { Command } from 'commander';
import { registerWorkflowDefinitionCommands } from './workflow/definitionCommands';
import { registerWorkflowRunCommands } from './workflow/runCommands';
import { registerWorkflowExecutionCommand } from './workflow/executionCommand';

export class WorkflowCommand {
    static register(program: Command): void {
        const workflow = program.command('workflow').description('Manage and execute workflows');
        registerWorkflowDefinitionCommands(workflow);
        registerWorkflowRunCommands(workflow);
        registerWorkflowExecutionCommand(workflow);
    }
}
