import { inject, injectable } from 'tsyringe';
import { randomUUID } from 'crypto';
import { Result, ok, err } from 'neverthrow';
import type { IWorkflowRepository } from '@domain/ports/IWorkflowRepository';
import type { ILogger } from '@domain/ports';
import type { WorkflowDefinition, WorkflowRunRecord, WorkflowStepRunRecord, WorkflowStepDefinition } from '@domain/entities/Workflow';
import type { AtomicWorkflowTransitionInput } from '@domain/ports/IWorkflowRepository';

/**
 * Owns all workflow-run + step-run persistence so WorkflowRunOrchestratorService can
 * stay a pure sequencer (mirrors runs/ RunLifecycleManager + RunTerminalizationService).
 * Terminal transitions go through the atomic path; non-terminal step completions are
 * single-row updates whose failure is logged, never thrown.
 */
@injectable()
export class WorkflowLifecycleManager {
    constructor(
        @inject('IWorkflowRepository') private readonly persistence: IWorkflowRepository,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    /** Creates the workflow run row. Returns the new id or an error message. */
    async begin(definition: WorkflowDefinition): Promise<Result<string, string>> {
        const workflowRunId = randomUUID();
        const result = await this.persistence.saveWorkflowRun({
            id: workflowRunId,
            workflowDefinitionId: definition.id,
            workflowVersion: definition.version,
            status: 'running',
            startedAt: new Date().toISOString(),
        });
        return result.isErr() ? err(result.error.message) : ok(workflowRunId);
    }

    /** Creates the step run row. Returns the new id or an error message. */
    async beginStep(workflowRunId: string, step: WorkflowStepDefinition, stepIndex: number): Promise<Result<string, string>> {
        const stepRunId = randomUUID();
        const result = await this.persistence.saveWorkflowStepRun({
            id: stepRunId,
            workflowRunId,
            stepId: step.id,
            stepIndex,
            status: 'running',
            startedAt: new Date().toISOString(),
        });
        return result.isErr() ? err(result.error.message) : ok(stepRunId);
    }

    /** Non-terminal step completion (continueOnFailure or mid-workflow success). */
    async completeStep(stepRunId: string, success: boolean, summary?: string, runId?: string): Promise<void> {
        const result = await this.persistence.updateWorkflowStepRun(
            stepRunId,
            this.stepUpdates(success ? 'completed' : 'failed', summary, runId),
        );
        if (result.isErr()) {
            this.logger.warn('[WorkflowLifecycleManager] Failed to update workflow step run', { stepRunId, reason: result.error.message });
        }
    }

    /** Terminal failure: step + workflow both marked failed in one atomic transition. */
    async failStepAtomic(workflowRunId: string, stepRunId: string, summary: string, runId?: string): Promise<void> {
        await this.commitTerminal({
            workflowRunId,
            workflowRunUpdates: { status: 'failed', summary, completedAt: new Date().toISOString() },
            workflowStepRunId: stepRunId,
            workflowStepRunUpdates: this.stepUpdates('failed', summary, runId),
        }, 'failed-step');
    }

    /** Terminal success of the whole workflow + the final step, in one atomic transition. */
    async completeAtomic(workflowRunId: string, stepRunId: string, summary: string, stepSummary?: string, runId?: string): Promise<void> {
        await this.commitTerminal({
            workflowRunId,
            workflowRunUpdates: { status: 'completed', summary, completedAt: new Date().toISOString() },
            workflowStepRunId: stepRunId,
            workflowStepRunUpdates: this.stepUpdates('completed', stepSummary, runId),
        }, 'completed');
    }

    /** Terminal workflow status with no step row to update (cancel, session-init failure). */
    async terminate(workflowRunId: string, status: WorkflowRunRecord['status'], summary: string): Promise<void> {
        const result = await this.persistence.updateWorkflowRun(workflowRunId, {
            status, summary, completedAt: new Date().toISOString(),
        });
        if (result.isErr()) {
            this.logger.warn('[WorkflowLifecycleManager] Failed to persist terminal workflow status', { workflowRunId, reason: result.error.message });
        }
    }

    private async commitTerminal(input: AtomicWorkflowTransitionInput, kind: string): Promise<void> {
        const result = await this.persistence.commitAtomicWorkflowTransition(input);
        if (result.isErr()) {
            this.logger.warn(`[WorkflowLifecycleManager] Failed to atomically persist ${kind} transition`, {
                workflowRunId: input.workflowRunId, stepRunId: input.workflowStepRunId, reason: result.error.message,
            });
        }
    }

    private stepUpdates(status: WorkflowStepRunRecord['status'], summary?: string, runId?: string): AtomicWorkflowTransitionInput['workflowStepRunUpdates'] {
        return {
            status,
            completedAt: new Date().toISOString(),
            ...(summary ? { summary } : {}),
            ...(runId ? { runId } : {}),
        };
    }
}
