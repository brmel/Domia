import { inject, injectable } from 'tsyringe';
import { randomUUID } from 'crypto';
import type { WorkflowEvent } from '@domain/WorkflowEvent';
import type { IWorkflowRepository } from '@domain/ports/IWorkflowRepository';
import type { ILogger } from '@domain/ports';
import { RunState } from '@domain/enums';
import type { WorkflowDefinition } from '@domain/entities/Workflow';
import { ExecutionController } from '@application/ExecutionController';
import { WorkflowStepPolicyService } from './WorkflowStepPolicyService';
import { WorkflowStepGovernanceService } from './WorkflowStepGovernanceService';
import { WorkflowStepRunnerService } from './WorkflowStepRunnerService';
import { PlatformCapabilityNegotiationService } from '../platform/PlatformCapabilityNegotiationService';

@injectable()
export class WorkflowRunOrchestratorService {
    constructor(
        @inject('IWorkflowRepository') private readonly persistence: IWorkflowRepository,
        @inject('ILogger') private readonly logger: ILogger,
        @inject(WorkflowStepPolicyService) private readonly stepPolicy: WorkflowStepPolicyService,
        @inject(WorkflowStepGovernanceService) private readonly governance: WorkflowStepGovernanceService,
        @inject(WorkflowStepRunnerService) private readonly stepRunner: WorkflowStepRunnerService,
        @inject(PlatformCapabilityNegotiationService) private readonly capabilityNegotiation: PlatformCapabilityNegotiationService
    ) {}

    async *executeWorkflow(definitionId: string, controller: ExecutionController): AsyncGenerator<WorkflowEvent, void, unknown> {
        const definitionResult = await this.persistence.getWorkflowDefinition(definitionId);
        if (definitionResult.isErr()) {
            const reason = definitionResult.error.message;
            yield { type: 'workflow_failed', workflowRunId: 'unknown', reason };
            return;
        }

        const definition = definitionResult.value;
        if (!definition) {
            yield { type: 'workflow_failed', workflowRunId: 'unknown', reason: `Workflow definition not found: ${definitionId}` };
            return;
        }

        const workflowRunId = randomUUID();
        const startedAt = new Date().toISOString();

        const saveRunResult = await this.persistence.saveWorkflowRun({
            id: workflowRunId,
            workflowDefinitionId: definition.id,
            workflowVersion: definition.version,
            status: 'running',
            startedAt
        });

        if (saveRunResult.isErr()) {
            yield { type: 'workflow_failed', workflowRunId, reason: saveRunResult.error.message };
            return;
        }

        yield {
            type: 'workflow_started',
            workflowRunId,
            workflowDefinitionId: definition.id
        };

        let sharedSession;
        try {
            sharedSession = await this.stepRunner.openSharedSession(definition);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            const terminalReason = `Workflow session initialization failed: ${reason}`;
            const completedAt = new Date().toISOString();

            const updateRunResult = await this.persistence.updateWorkflowRun(workflowRunId, {
                status: 'failed',
                summary: terminalReason,
                completedAt
            });

            if (updateRunResult.isErr()) {
                this.logger.warn('[WorkflowRunOrchestratorService] Failed to persist workflow session initialization failure', {
                    workflowRunId,
                    reason: updateRunResult.error.message
                });
            }

            yield {
                type: 'workflow_failed',
                workflowRunId,
                reason: terminalReason
            };

            return;
        }

        let shouldNavigateSharedSession = sharedSession.shouldNavigate;
        let completedSteps = 0;

        try {
            for (const [stepIndex, step] of definition.steps.entries()) {
                if (controller.state === RunState.CANCELLED) {
                    await this.persistTerminalWorkflowStatus(workflowRunId, 'cancelled', 'Workflow cancelled by operator.');
                    yield { type: 'workflow_completed', workflowRunId, success: false, summary: 'Workflow cancelled by operator.' };
                    return;
                }

                const stepRunId = randomUUID();
                const saveStepRunResult = await this.persistence.saveWorkflowStepRun({
                    id: stepRunId,
                    workflowRunId,
                    stepId: step.id,
                    stepIndex,
                    status: 'running',
                    startedAt: new Date().toISOString()
                });

                if (saveStepRunResult.isErr()) {
                    await this.persistTerminalWorkflowStatus(workflowRunId, 'failed', saveStepRunResult.error.message);
                    yield { type: 'workflow_failed', workflowRunId, reason: saveStepRunResult.error.message };
                    return;
                }

                yield { type: 'workflow_step_started', workflowRunId, stepId: step.id, stepIndex };

                const governanceDecision = this.governance.assess(step, definition);
                if (!governanceDecision.allowed) {
                    yield* this.yieldBlockedTransition(workflowRunId, stepRunId, step.id, stepIndex, governanceDecision.reason, 'governance');
                    return;
                }

                const capabilityAssessment = this.capabilityNegotiation.assessStep(step, definition.platformConfig.platform);
                if (capabilityAssessment.blocked) {
                    const blockedReason = capabilityAssessment.reason ?? `Step '${step.name}' blocked by platform capability policy.`;
                    yield* this.yieldBlockedTransition(workflowRunId, stepRunId, step.id, stepIndex, blockedReason, 'capability');
                    return;
                }

                const degradedCapabilities = capabilityAssessment.decisions.filter((d) => d.support === 'degraded');
                const degradationSummary = degradedCapabilities.length > 0
                    ? `Capability degradation: ${degradedCapabilities.map((d) => d.capability).join(', ')}`
                    : undefined;

                const stepResult = await this.stepPolicy.runWithPolicy(step, async () =>
                    this.stepRunner.runStep(step, stepIndex, definition, controller, {
                        session: sharedSession,
                        shouldNavigate: shouldNavigateSharedSession
                    })
                );

                shouldNavigateSharedSession = false;

                if (stepResult.runId) {
                    yield { type: 'workflow_step_bound', workflowRunId, stepId: step.id, stepIndex, runId: stepResult.runId };
                }

                const combinedSummary = [stepResult.summary, degradationSummary].filter(Boolean).join(' | ') || undefined;

                const updateStepRunResult = await this.persistence.updateWorkflowStepRun(stepRunId, {
                    status: stepResult.success ? 'completed' : 'failed',
                    ...(combinedSummary ? { summary: combinedSummary } : {}),
                    ...(stepResult.runId ? { runId: stepResult.runId } : {}),
                    completedAt: new Date().toISOString()
                });

                if (updateStepRunResult.isErr()) {
                    this.logger.warn('[WorkflowRunOrchestratorService] Failed to update workflow step run', {
                        workflowRunId, stepRunId, reason: updateStepRunResult.error.message
                    });
                }

                yield {
                    type: 'workflow_step_completed', workflowRunId, stepId: step.id, stepIndex,
                    success: stepResult.success,
                    ...(combinedSummary ? { summary: combinedSummary } : {})
                };

                if (!stepResult.success) {
                    if (step.continueOnFailure) continue;

                    const terminalReason = stepResult.summary ?? `Step failed: ${step.name}`;
                    const completedAt = new Date().toISOString();
                    const terminalResult = await this.persistence.commitAtomicWorkflowTransition({
                        workflowRunId,
                        workflowRunUpdates: { status: 'failed', summary: terminalReason, completedAt },
                        workflowStepRunId: stepRunId,
                        workflowStepRunUpdates: {
                            status: 'failed',
                            ...(terminalReason ? { summary: terminalReason } : {}),
                            ...(stepResult.runId ? { runId: stepResult.runId } : {}),
                            completedAt
                        }
                    });

                    if (terminalResult.isErr()) {
                        this.logger.warn('[WorkflowRunOrchestratorService] Failed to atomically persist terminal transition', {
                            workflowRunId, stepRunId, reason: terminalResult.error.message
                        });
                    }

                    yield { type: 'workflow_failed', workflowRunId, reason: terminalReason };
                    return;
                }

                completedSteps += 1;
            }

            const summary = `Workflow completed (${completedSteps}/${definition.steps.length} steps succeeded).`;
            await this.persistence.updateWorkflowRun(workflowRunId, {
                status: 'completed', summary, completedAt: new Date().toISOString()
            });

            yield { type: 'workflow_completed', workflowRunId, success: true, summary };
        } finally {
            await sharedSession.dispose().catch((error: unknown) => {
                const reason = error instanceof Error ? error.message : String(error);
                this.logger.warn('[WorkflowRunOrchestratorService] Failed to dispose shared workflow session', {
                    workflowRunId, reason
                });
            });
        }
    }

    private async persistTerminalWorkflowStatus(workflowRunId: string, status: string, summary: string): Promise<void> {
        const result = await this.persistence.updateWorkflowRun(workflowRunId, {
            status, summary, completedAt: new Date().toISOString()
        });
        if (result.isErr()) {
            this.logger.warn('[WorkflowRunOrchestratorService] Failed to persist terminal workflow status', {
                workflowRunId, reason: result.error.message
            });
        }
    }

    private async *yieldBlockedTransition(
        workflowRunId: string,
        stepRunId: string,
        stepId: string,
        stepIndex: number,
        blockedReason: string,
        source: 'governance' | 'capability',
    ): AsyncGenerator<WorkflowEvent, void, unknown> {
        const completedAt = new Date().toISOString();

        const blockedTransition = await this.persistence.commitAtomicWorkflowTransition({
            workflowRunId,
            workflowRunUpdates: {
                status: 'failed',
                summary: blockedReason,
                completedAt,
            },
            workflowStepRunId: stepRunId,
            workflowStepRunUpdates: {
                status: 'failed',
                summary: blockedReason,
                completedAt,
            },
        });

        if (blockedTransition.isErr()) {
            this.logger.warn(`[WorkflowRunOrchestratorService] Failed to atomically persist ${source}-blocked transition`, {
                workflowRunId,
                stepRunId,
                reason: blockedTransition.error.message,
            });
        }

        yield {
            type: 'workflow_step_completed',
            workflowRunId,
            stepId,
            stepIndex,
            success: false,
            summary: blockedReason,
        };

        yield {
            type: 'workflow_failed',
            workflowRunId,
            reason: blockedReason,
        };
    }

}