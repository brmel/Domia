import { inject, injectable } from 'tsyringe';
import { v4 as uuidv4 } from 'uuid';
import type { WorkflowEvent } from '@domain/events/WorkflowEvent';
import type { IPersistenceAdapter } from '@domain/ports/IPersistenceAdapter';
import type { ILogger } from '@domain/ports';
import { TestRunState } from '@domain/enums/TestRunState';
import { ExecutionController } from '@application/controllers/ExecutionController';
import { WorkflowStepPolicyService } from './WorkflowStepPolicyService';
import { WorkflowStepGovernanceService } from './WorkflowStepGovernanceService';
import { WorkflowStepRunnerService } from './WorkflowStepRunnerService';

@injectable()
export class WorkflowRunOrchestratorService {
    constructor(
        @inject('IPersistenceAdapter') private readonly persistence: IPersistenceAdapter,
        @inject('ILogger') private readonly logger: ILogger,
        @inject(WorkflowStepPolicyService) private readonly stepPolicy: WorkflowStepPolicyService,
        @inject(WorkflowStepGovernanceService) private readonly governance: WorkflowStepGovernanceService,
        @inject(WorkflowStepRunnerService) private readonly stepRunner: WorkflowStepRunnerService
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

        const workflowRunId = uuidv4();
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

        let completedSteps = 0;
        let failedReason: string | null = null;

        for (let stepIndex = 0; stepIndex < definition.steps.length; stepIndex++) {
            const step = definition.steps[stepIndex];
            if (!step) {
                continue;
            }

            if (controller.state === TestRunState.CANCELLED) {
                failedReason = 'Workflow cancelled by operator.';
                break;
            }

            const stepRunId = uuidv4();
            const stepStartedAt = new Date().toISOString();
            const saveStepRunResult = await this.persistence.saveWorkflowStepRun({
                id: stepRunId,
                workflowRunId,
                stepId: step.id,
                stepIndex,
                status: 'running',
                startedAt: stepStartedAt
            });

            if (saveStepRunResult.isErr()) {
                failedReason = saveStepRunResult.error.message;
                break;
            }

            yield {
                type: 'workflow_step_started',
                workflowRunId,
                stepId: step.id,
                stepIndex
            };

            const governanceDecision = this.governance.assess(step, definition, workflowRunId);
            if (!governanceDecision.allowed) {
                const blockedReason = governanceDecision.reason;
                const completedAt = new Date().toISOString();

                const blockedTransition = await this.persistence.commitAtomicWorkflowTransition({
                    workflowRunId,
                    workflowRunUpdates: {
                        status: 'failed',
                        summary: blockedReason,
                        completedAt
                    },
                    workflowStepRunId: stepRunId,
                    workflowStepRunUpdates: {
                        status: 'failed',
                        summary: blockedReason,
                        completedAt
                    }
                });

                if (blockedTransition.isErr()) {
                    this.logger.warn('[WorkflowRunOrchestratorService] Failed to atomically persist governance-blocked transition', {
                        workflowRunId,
                        stepRunId,
                        reason: blockedTransition.error.message
                    });
                }

                yield {
                    type: 'workflow_step_completed',
                    workflowRunId,
                    stepId: step.id,
                    stepIndex,
                    success: false,
                    summary: blockedReason
                };

                yield {
                    type: 'workflow_failed',
                    workflowRunId,
                    reason: blockedReason
                };

                return;
            }

            const stepResult = await this.stepPolicy.runWithPolicy(step, async () =>
                this.stepRunner.runStep(step, stepIndex, definition, controller)
            );

            if (stepResult.testRunId) {
                yield {
                    type: 'workflow_step_bound',
                    workflowRunId,
                    stepId: step.id,
                    stepIndex,
                    testRunId: stepResult.testRunId
                };
            }

            const updateStepRunResult = await this.persistence.updateWorkflowStepRun(stepRunId, {
                status: stepResult.success ? 'completed' : 'failed',
                ...(stepResult.summary ? { summary: stepResult.summary } : {}),
                ...(stepResult.testRunId ? { testRunId: stepResult.testRunId } : {}),
                completedAt: new Date().toISOString()
            });

            if (updateStepRunResult.isErr()) {
                this.logger.warn('[WorkflowRunOrchestratorService] Failed to update workflow step run', {
                    workflowRunId,
                    stepRunId,
                    reason: updateStepRunResult.error.message
                });
            }

            yield {
                type: 'workflow_step_completed',
                workflowRunId,
                stepId: step.id,
                stepIndex,
                success: stepResult.success,
                ...(stepResult.summary ? { summary: stepResult.summary } : {})
            };

            if (!stepResult.success) {
                if (step.continueOnFailure) {
                    continue;
                }

                const terminalReason = stepResult.summary ?? `Step failed: ${step.name}`;
                const completedAt = new Date().toISOString();
                const terminalResult = await this.persistence.commitAtomicWorkflowTransition({
                    workflowRunId,
                    workflowRunUpdates: {
                        status: 'failed',
                        summary: terminalReason,
                        completedAt
                    },
                    workflowStepRunId: stepRunId,
                    workflowStepRunUpdates: {
                        status: 'failed',
                        ...(terminalReason ? { summary: terminalReason } : {}),
                        ...(stepResult.testRunId ? { testRunId: stepResult.testRunId } : {}),
                        completedAt
                    }
                });

                if (terminalResult.isErr()) {
                    this.logger.warn('[WorkflowRunOrchestratorService] Failed to atomically persist terminal transition', {
                        workflowRunId,
                        stepRunId,
                        reason: terminalResult.error.message
                    });
                }

                yield {
                    type: 'workflow_failed',
                    workflowRunId,
                    reason: terminalReason
                };

                return;
            }

            completedSteps += 1;
        }

        if (!failedReason) {
            const summary = `Workflow completed (${completedSteps}/${definition.steps.length} steps succeeded).`;
            await this.persistence.updateWorkflowRun(workflowRunId, {
                status: 'completed',
                summary,
                completedAt: new Date().toISOString()
            });

            yield {
                type: 'workflow_completed',
                workflowRunId,
                success: true,
                summary
            };
            return;
        }

        const terminalStatus = controller.state === TestRunState.CANCELLED ? 'cancelled' : 'failed';
        await this.persistence.updateWorkflowRun(workflowRunId, {
            status: terminalStatus,
            summary: failedReason,
            completedAt: new Date().toISOString()
        });

        if (controller.state === TestRunState.CANCELLED) {
            yield {
                type: 'workflow_completed',
                workflowRunId,
                success: false,
                summary: failedReason
            };
            return;
        }

        yield {
            type: 'workflow_failed',
            workflowRunId,
            reason: failedReason
        };
    }

}