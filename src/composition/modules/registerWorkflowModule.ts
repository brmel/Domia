import { container } from 'tsyringe';
import { WorkflowExecutionService } from '@application/services/workflow/WorkflowExecutionService';
import { WorkflowDefinitionService } from '@application/services/workflow/WorkflowDefinitionService';
import { WorkflowRunOrchestratorService } from '@application/services/workflow/WorkflowRunOrchestratorService';
import { WorkflowStepGovernanceService } from '@application/services/workflow/WorkflowStepGovernanceService';
import { WorkflowStepRunnerService } from '@application/services/workflow/WorkflowStepRunnerService';
import { WorkflowStepPolicyService } from '@application/services/workflow/WorkflowStepPolicyService';

export function registerWorkflowModule(): void {
    container.registerSingleton(WorkflowDefinitionService);
    container.registerSingleton(WorkflowStepPolicyService);
    container.registerSingleton(WorkflowStepGovernanceService);
    container.registerSingleton(WorkflowStepRunnerService);
    container.registerSingleton(WorkflowRunOrchestratorService);
    container.registerSingleton(WorkflowExecutionService);
}
