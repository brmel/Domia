import { inject, injectable } from 'tsyringe';
import type { WorkflowEvent } from '@domain/WorkflowEvent';
import type { IWorkflowRepository } from '@domain/ports/IWorkflowRepository';
import type { ILogger } from '@domain/ports';
import { RunState } from '@domain/enums';
import { ExecutionController } from '@backend/ExecutionController';
import { WorkflowStepPolicyService } from './WorkflowStepPolicyService';
import { WorkflowStepGovernanceService } from './WorkflowStepGovernanceService';
import { WorkflowStepRunnerService } from './WorkflowStepRunnerService';
import { WorkflowLifecycleManager } from './WorkflowLifecycleManager';
import { PlatformCapabilityNegotiationService } from '../platform/PlatformCapabilityNegotiationService';

/**
 * Pure sequencer over a workflow definition. Owns NO persistence mechanics — all
 * workflow/step row writes go through WorkflowLifecycleManager (mirrors how runs/
 * decomposes RunUseCase from RunLifecycleManager/RunTerminalizationService). It loads
 * the definition (read), opens one shared browser session, and drives each step through
 * governance → capability → policy → runner, emitting WorkflowEvents as it goes.
 */
@injectable()
export class WorkflowRunOrchestratorService {
    constructor(
        @inject('IWorkflowRepository') private readonly persistence: IWorkflowRepository,
        @inject('ILogger') private readonly logger: ILogger,
        @inject(WorkflowStepPolicyService) private readonly stepPolicy: WorkflowStepPolicyService,
        @inject(WorkflowStepGovernanceService) private readonly governance: WorkflowStepGovernanceService,
        @inject(WorkflowStepRunnerService) private readonly stepRunner: WorkflowStepRunnerService,
        @inject(PlatformCapabilityNegotiationService) private readonly capabilityNegotiation: PlatformCapabilityNegotiationService,
        @inject(WorkflowLifecycleManager) private readonly lifecycle: WorkflowLifecycleManager,
    ) {}

    async *executeWorkflow(definitionId: string, controller: ExecutionController): AsyncGenerator<WorkflowEvent, void, unknown> {
        const definitionResult = await this.persistence.getWorkflowDefinition(definitionId);
        if (definitionResult.isErr()) {
            yield { type: 'workflow_failed', workflowRunId: 'unknown', reason: definitionResult.error.message };
            return;
        }
        const definition = definitionResult.value;
        if (!definition) {
            yield { type: 'workflow_failed', workflowRunId: 'unknown', reason: `Workflow definition not found: ${definitionId}` };
            return;
        }

        const beginResult = await this.lifecycle.begin(definition);
        if (beginResult.isErr()) {
            yield { type: 'workflow_failed', workflowRunId: 'unknown', reason: beginResult.error };
            return;
        }
        const workflowRunId = beginResult.value;

        yield { type: 'workflow_started', workflowRunId, workflowDefinitionId: definition.id };

        let sharedSession;
        try {
            sharedSession = await this.stepRunner.openSharedSession(definition);
        } catch (error) {
            const reason = `Workflow session initialization failed: ${error instanceof Error ? error.message : String(error)}`;
            await this.lifecycle.terminate(workflowRunId, 'failed', reason);
            yield { type: 'workflow_failed', workflowRunId, reason };
            return;
        }

        let shouldNavigateSharedSession = sharedSession.shouldNavigate;
        let completedSteps = 0;
        const totalSteps = definition.steps.length;

        try {
            for (const [stepIndex, step] of definition.steps.entries()) {
                if (controller.state === RunState.CANCELLED) {
                    await this.lifecycle.terminate(workflowRunId, 'cancelled', 'Workflow cancelled by operator.');
                    yield { type: 'workflow_completed', workflowRunId, success: false, summary: 'Workflow cancelled by operator.' };
                    return;
                }

                const beginStepResult = await this.lifecycle.beginStep(workflowRunId, step, stepIndex);
                if (beginStepResult.isErr()) {
                    await this.lifecycle.terminate(workflowRunId, 'failed', beginStepResult.error);
                    yield { type: 'workflow_failed', workflowRunId, reason: beginStepResult.error };
                    return;
                }
                const stepRunId = beginStepResult.value;

                yield { type: 'workflow_step_started', workflowRunId, stepId: step.id, stepIndex };

                const governanceDecision = this.governance.assess(step, definition);
                for (const warning of governanceDecision.warnings) {
                    this.logger.warn(`[WorkflowOrchestrator] step ${step.id}: ${warning}`);
                }

                const capabilityAssessment = this.capabilityNegotiation.assessStep(step, definition.platformConfig.platform);
                if (capabilityAssessment.blocked) {
                    const blockedReason = capabilityAssessment.reason ?? `Step '${step.name}' blocked by platform capability policy.`;
                    await this.lifecycle.failStepAtomic(workflowRunId, stepRunId, blockedReason);
                    yield { type: 'workflow_step_completed', workflowRunId, stepId: step.id, stepIndex, success: false, summary: blockedReason };
                    yield { type: 'workflow_failed', workflowRunId, reason: blockedReason };
                    return;
                }

                const degradedCapabilities = capabilityAssessment.decisions.filter((d) => d.support === 'degraded');
                const degradationSummary = degradedCapabilities.length > 0
                    ? `Capability degradation: ${degradedCapabilities.map((d) => d.capability).join(', ')}`
                    : undefined;

                const stepResult = await this.stepPolicy.runWithPolicy(step, async () =>
                    this.stepRunner.runStep(step, stepIndex, definition, controller, {
                        session: sharedSession,
                        shouldNavigate: shouldNavigateSharedSession,
                    })
                );

                shouldNavigateSharedSession = false;

                if (stepResult.runId) {
                    yield { type: 'workflow_step_bound', workflowRunId, stepId: step.id, stepIndex, runId: stepResult.runId };
                }

                const combinedSummary = [stepResult.summary, degradationSummary].filter(Boolean).join(' | ') || undefined;
                const summaryEvent = combinedSummary ? { summary: combinedSummary } : {};

                if (!stepResult.success && !step.continueOnFailure) {
                    const reason = combinedSummary ?? `Step failed: ${step.name}`;
                    await this.lifecycle.failStepAtomic(workflowRunId, stepRunId, reason, stepResult.runId);
                    yield { type: 'workflow_step_completed', workflowRunId, stepId: step.id, stepIndex, success: false, ...summaryEvent };
                    yield { type: 'workflow_failed', workflowRunId, reason };
                    return;
                }

                if (stepResult.success) completedSteps += 1;

                if (stepResult.success && stepIndex === totalSteps - 1) {
                    // Final step succeeded: commit the step completion AND the workflow
                    // completion in one atomic transition — closes the crash-between-writes
                    // gap the old separate updateStepRun + updateWorkflowRun success path had.
                    const summary = `Workflow completed (${completedSteps}/${totalSteps} steps succeeded).`;
                    await this.lifecycle.completeAtomic(workflowRunId, stepRunId, summary, combinedSummary, stepResult.runId);
                    yield { type: 'workflow_step_completed', workflowRunId, stepId: step.id, stepIndex, success: true, ...summaryEvent };
                    yield { type: 'workflow_completed', workflowRunId, success: true, summary };
                    return;
                }

                await this.lifecycle.completeStep(stepRunId, stepResult.success, combinedSummary, stepResult.runId);
                yield { type: 'workflow_step_completed', workflowRunId, stepId: step.id, stepIndex, success: stepResult.success, ...summaryEvent };
            }

            // Reached only when the last step failed under continueOnFailure (no atomic
            // completion fired above): the step row is already updated; finalize the workflow.
            const summary = `Workflow completed (${completedSteps}/${totalSteps} steps succeeded).`;
            await this.lifecycle.terminate(workflowRunId, 'completed', summary);
            yield { type: 'workflow_completed', workflowRunId, success: true, summary };
        } finally {
            await sharedSession.dispose().catch((error: unknown) => {
                this.logger.warn('[WorkflowRunOrchestratorService] Failed to dispose shared workflow session', {
                    workflowRunId, reason: error instanceof Error ? error.message : String(error),
                });
            });
        }
    }
}
