import { inject, injectable } from 'tsyringe';
import { randomUUID } from 'crypto';
import type { WorkflowEvent } from '@domain/events/WorkflowEvent';
import type { IWorkflowRepository } from '@domain/ports/IWorkflowRepository';
import type { ILogger } from '@domain/ports';
import { RunState } from '@domain/enums/RunState';
import type { WorkflowDefinition } from '@domain/entities/Workflow';
import type { WorkflowExecutionGraph } from '@domain/value-objects';
import { ExecutionGraph } from '@domain/value-objects';
import { ExecutionController } from '@application/controllers/ExecutionController';
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
        let failedReason: string | null = null;
        let executionGraph = this.createWorkflowGraph(definition);
        const stepById = new Map(definition.steps.map((step) => [step.id, step]));

        try {
            while (true) {
                const nextNode = ExecutionGraph.selectNextReadyNode(executionGraph);
                if (!nextNode) {
                    break;
                }

                executionGraph = ExecutionGraph.updateNodeState(executionGraph, nextNode.id, 'running');

                const step = stepById.get(nextNode.id);
                if (!step) {
                    failedReason = `Workflow graph node '${nextNode.id}' has no matching step definition.`;
                    executionGraph = ExecutionGraph.updateNodeState(executionGraph, nextNode.id, 'failed');
                    break;
                }

                const stepIndex = definition.steps.findIndex((candidate) => candidate.id === step.id);
                if (stepIndex < 0) {
                    failedReason = `Workflow step index resolution failed for step '${step.id}'.`;
                    executionGraph = ExecutionGraph.updateNodeState(executionGraph, nextNode.id, 'failed');
                    break;
                }

                if (controller.state === RunState.CANCELLED) {
                    failedReason = 'Workflow cancelled by operator.';
                    executionGraph = ExecutionGraph.updateNodeState(executionGraph, nextNode.id, 'failed');
                    break;
                }

                const stepRunId = randomUUID();
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
                    executionGraph = ExecutionGraph.updateNodeState(executionGraph, nextNode.id, 'failed');
                    break;
                }

                yield {
                    type: 'workflow_step_started',
                    workflowRunId,
                    stepId: step.id,
                    stepIndex
                };

                const governanceDecision = this.governance.assess(step, definition);
                if (!governanceDecision.allowed) {
                    const blockedReason = governanceDecision.reason;
                    executionGraph = ExecutionGraph.updateNodeState(executionGraph, nextNode.id, 'failed');

                    yield* this.yieldBlockedTransition(workflowRunId, stepRunId, step.id, stepIndex, blockedReason, 'governance');
                    return;
                }

                const capabilityAssessment = this.capabilityNegotiation.assessStep(step, definition.platformConfig.platform);
                if (capabilityAssessment.blocked) {
                    const blockedReason = capabilityAssessment.reason ?? `Step '${step.name}' blocked by platform capability policy.`;
                    executionGraph = ExecutionGraph.updateNodeState(executionGraph, nextNode.id, 'failed');

                    yield* this.yieldBlockedTransition(workflowRunId, stepRunId, step.id, stepIndex, blockedReason, 'capability');
                    return;
                }

                const degradedCapabilities = capabilityAssessment.decisions.filter((decision) => decision.support === 'degraded');
                const degradationSummary = degradedCapabilities.length > 0
                    ? `Capability degradation: ${degradedCapabilities.map((decision) => decision.capability).join(', ')}`
                    : undefined;

                const stepResult = await this.stepPolicy.runWithPolicy(step, async () =>
                    this.stepRunner.runStep(step, stepIndex, definition, controller, {
                        session: sharedSession,
                        shouldNavigate: shouldNavigateSharedSession
                    })
                );

                shouldNavigateSharedSession = false;

                if (stepResult.runId) {
                    yield {
                        type: 'workflow_step_bound',
                        workflowRunId,
                        stepId: step.id,
                        stepIndex,
                        runId: stepResult.runId
                    };
                }

                const updateStepRunResult = await this.persistence.updateWorkflowStepRun(stepRunId, {
                    status: stepResult.success ? 'completed' : 'failed',
                    ...((stepResult.summary || degradationSummary)
                        ? {
                            summary: [stepResult.summary, degradationSummary].filter(Boolean).join(' | ')
                        }
                        : {}),
                    ...(stepResult.runId ? { runId: stepResult.runId } : {}),
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
                    ...((stepResult.summary || degradationSummary)
                        ? {
                            summary: [stepResult.summary, degradationSummary].filter(Boolean).join(' | ')
                        }
                        : {})
                };

                if (!stepResult.success) {
                    if (step.continueOnFailure) {
                        executionGraph = ExecutionGraph.updateNodeState(executionGraph, nextNode.id, 'skipped');
                        continue;
                    }

                    executionGraph = ExecutionGraph.updateNodeState(executionGraph, nextNode.id, 'failed');
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
                            ...(stepResult.runId ? { runId: stepResult.runId } : {}),
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

                executionGraph = ExecutionGraph.updateNodeState(executionGraph, nextNode.id, 'completed');
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

            const terminalStatus = controller.state === RunState.CANCELLED ? 'cancelled' : 'failed';
            await this.persistence.updateWorkflowRun(workflowRunId, {
                status: terminalStatus,
                summary: failedReason,
                completedAt: new Date().toISOString()
            });

            if (controller.state === RunState.CANCELLED) {
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
        } finally {
            await sharedSession.dispose().catch((error: unknown) => {
                const reason = error instanceof Error ? error.message : String(error);
                this.logger.warn('[WorkflowRunOrchestratorService] Failed to dispose shared workflow session', {
                    workflowRunId,
                    reason
                });
            });
        }
    }

    private createWorkflowGraph(definition: WorkflowDefinition): WorkflowExecutionGraph {
        const nodes = definition.steps.map((step) => ({
            id: step.id,
            description: step.name,
            kind: 'action' as const,
            state: 'pending' as const,
            type: 'general' as const,
            metadata: {
                workflowStepPrompt: step.prompt
            }
        }));

        const edges = definition.steps.flatMap((step, index) => {
            const next = definition.steps[index + 1];
            if (!next) {
                return [];
            }

            return [{ fromNodeId: step.id, toNodeId: next.id }];
        });

        return {
            id: `workflow-graph:${definition.id}:${definition.version}`,
            sourcePlanId: definition.id,
            version: definition.version,
            createdAt: new Date().toISOString(),
            nodes,
            edges,
            entryNodeIds: definition.steps[0] ? [definition.steps[0].id] : [],
            terminalNodeIds: definition.steps.length > 0 ? [definition.steps[definition.steps.length - 1]!.id] : []
        };
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