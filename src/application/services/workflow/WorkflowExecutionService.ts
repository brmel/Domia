import type { WorkflowEvent } from '@domain/events/WorkflowEvent';
import { inject, injectable } from 'tsyringe';
import { ExecutionController } from '@application/controllers/ExecutionController';
import { WorkflowRunOrchestratorService } from './WorkflowRunOrchestratorService';

@injectable()
export class WorkflowExecutionService {
    constructor(
        @inject(WorkflowRunOrchestratorService) private readonly orchestrator: WorkflowRunOrchestratorService
    ) {}

    async *executeWorkflow(definitionId: string, controller: ExecutionController): AsyncGenerator<WorkflowEvent, void, unknown> {
        yield* this.orchestrator.executeWorkflow(definitionId, controller);
    }
}
