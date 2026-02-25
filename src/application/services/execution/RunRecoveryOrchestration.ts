import { v4 as uuidv4 } from 'uuid';
import { UrlFactory } from '@domain/value-objects';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';
import type { AgentAction } from '@domain/value-objects';
import { ActionType } from '@domain/enums/ActionType';
import { RunState } from '@domain/enums/RunState';
import type { ILogger, IPersistenceAdapter, Step, IAppAutomation } from '@domain/ports';
import { WorkflowError } from '@domain/errors';
import type { RunInput } from '@application/dtos';
import type { ExecutionController } from '@application/controllers/ExecutionController';
import type { RunDurabilityService } from './RunDurabilityService';
import type { CheckpointCompactionService } from './CheckpointCompactionService';
import type { RecoveryReadModelService } from './RecoveryReadModelService';
import type { ManualRecoveryBootstrapService } from './ManualRecoveryBootstrapService';
import type { RecoveryMode, RunRecoveryPolicyService } from './RunRecoveryPolicyService';
import type { RecoveryReplayGuardService } from './RecoveryReplayGuardService';
import type { RecoveryReplayIdempotencyService } from './RecoveryReplayIdempotencyService';
import type { BranchRollbackService } from './BranchRollbackService';
import type { Plan } from '@domain/entities/Plan';

export interface RecoveryBootstrapContext {
    readonly sourceRunId: string;
    readonly branchId: string;
    readonly state: WorkflowState;
    readonly plan?: Plan;
    readonly startPlanIndex: number;
}

export type RecoveryReplayOutcome =
    | { readonly type: 'ok'; readonly state: WorkflowState; readonly replayedCount: number }
    | { readonly type: 'cancelled'; readonly state: WorkflowState; readonly replayedCount: number }
    | { readonly type: 'blocked'; readonly reason: string; readonly replayedCount: number }
    | { readonly type: 'failed'; readonly reason: string; readonly replayedCount: number };

export interface RunRecoveryDependencies {
    readonly persistence: IPersistenceAdapter;
    readonly durability: RunDurabilityService;
    readonly checkpointCompaction: CheckpointCompactionService;
    readonly branchRollback: BranchRollbackService;
    readonly recoveryReadModel: RecoveryReadModelService;
    readonly recoveryBootstrap: ManualRecoveryBootstrapService;
    readonly recoveryPolicy: RunRecoveryPolicyService;
    readonly recoveryReplayGuard: RecoveryReplayGuardService;
    readonly recoveryReplayIdempotency: RecoveryReplayIdempotencyService;
    readonly logger: ILogger;
}

export async function resolveRecoveryContext(
    dependencies: RunRecoveryDependencies,
    input: RunInput
): Promise<RecoveryBootstrapContext | null> {
    const recoveryRunId = input.options?.recoveryRunId?.trim();

    if (!recoveryRunId) {
        return null;
    }

    const checkpoints = await dependencies.durability.getCheckpointRecords(recoveryRunId);
    const compactedView = dependencies.checkpointCompaction.compact(recoveryRunId, checkpoints);
    const readModel = dependencies.recoveryReadModel.build(recoveryRunId, compactedView.compacted);
    const recoveryMode: RecoveryMode = input.options?.recoveryMode ?? 'manual-only';
    const decision = dependencies.recoveryPolicy.decide(readModel, recoveryMode);

    dependencies.logger.info('[RunUseCase] Recovery decision evaluated', {
        recoveryRunId,
        recoveryMode,
        shouldRecover: decision.shouldRecover,
        reason: decision.reason,
        checkpointCount: checkpoints.length,
        compactedCheckpointCount: compactedView.compacted.length
    });

    if (!decision.shouldRecover || recoveryMode !== 'manual-only') {
        return null;
    }

    const latest = compactedView.latest;
    if (!latest) {
        dependencies.logger.warn('[RunUseCase] Recovery bootstrap skipped: latest checkpoint unavailable', {
            recoveryRunId,
            recoveryMode
        });
        return null;
    }

    const rollbackDecision = dependencies.branchRollback.rollbackToNearestBoundary(
        recoveryRunId,
        latest.branchId,
        checkpoints
    );

    const recoveryCheckpoint = rollbackDecision.rollbackCheckpoint ?? latest;
    const bootstrap = dependencies.recoveryBootstrap.bootstrapFromCheckpoint(recoveryCheckpoint.state);

    if (rollbackDecision.invalidatedCheckpointIds.length > 0) {
        dependencies.logger.warn('[RunUseCase] Recovery rollback selected nearest commit boundary', {
            recoveryRunId,
            branchId: rollbackDecision.branchId,
            rollbackCheckpointId: rollbackDecision.rollbackCheckpoint?.checkpointId,
            invalidatedCheckpointIds: rollbackDecision.invalidatedCheckpointIds
        });
    }

    dependencies.logger.info('[RunUseCase] Recovery bootstrap applied from latest checkpoint', {
        recoveryRunId,
        stepNumber: bootstrap.state.stepNumber,
        status: bootstrap.state.status,
        startPlanIndex: bootstrap.startPlanIndex,
        hasPlan: Boolean(bootstrap.state.plan)
    });

    return {
        sourceRunId: recoveryRunId,
        branchId: recoveryCheckpoint.branchId,
        state: bootstrap.state,
        ...(bootstrap.state.plan ? { plan: bootstrap.state.plan } : {}),
        startPlanIndex: bootstrap.startPlanIndex
    };
}

export async function replayRecoveryActions(
    dependencies: RunRecoveryDependencies,
    params: {
        runId: string;
        sourceRunId: string;
        sourceBranchId: string;
        automation: IAppAutomation;
        controller: ExecutionController;
        state: WorkflowState;
        targetStepNumber: number;
    }
): Promise<RecoveryReplayOutcome> {
    const { runId, sourceRunId, sourceBranchId, automation, controller, state, targetStepNumber } = params;

    if (targetStepNumber <= 0) {
        return { type: 'ok', state, replayedCount: 0 };
    }

    const stepsResult = await dependencies.persistence.getSteps(sourceRunId);
    if (stepsResult.isErr()) {
        return { type: 'failed', reason: stepsResult.error.message, replayedCount: 0 };
    }

    const sourceSteps = stepsResult.value;
    if (sourceSteps.length < targetStepNumber) {
        return {
            type: 'failed',
            reason: `Checkpoint step target (${targetStepNumber}) exceeds available source steps (${sourceSteps.length})`,
            replayedCount: 0
        };
    }

    let replayedCount = 0;
    let nextState = state;

    for (const sourceStep of sourceSteps.slice(0, targetStepNumber)) {
        if (controller.state === RunState.CANCELLED) {
            return { type: 'cancelled', state: nextState, replayedCount };
        }

        const action = sourceStep.actionPayload;
        const decision = dependencies.recoveryReplayGuard.decide(action);

        if (decision.decision === 'block') {
            return {
                type: 'blocked',
                reason: `${decision.reason} at source step ${sourceStep.stepNumber}`,
                replayedCount
            };
        }

        if (decision.decision === 'skip') {
            dependencies.logger.debug('[RunUseCase] Recovery replay skipped action', {
                runId,
                sourceRunId,
                sourceStepNumber: sourceStep.stepNumber,
                actionType: action.type,
                reason: decision.reason
            });
            continue;
        }

        const scopedIdempotencyKey = dependencies.recoveryReplayIdempotency.buildNodeReplayKey({
            runId: runId,
            branchId: sourceBranchId,
            nodeId: sourceStep.id,
            actionSignature: decision.idempotencyKey
        });

        let shouldExecute = true;
        try {
            shouldExecute = await dependencies.recoveryReplayIdempotency.shouldExecute(runId, scopedIdempotencyKey);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            return {
                type: 'failed',
                reason: `Idempotency lookup failed at source step ${sourceStep.stepNumber}: ${reason}`,
                replayedCount
            };
        }

        if (!shouldExecute) {
            dependencies.logger.debug('[RunUseCase] Recovery replay deduped action by idempotency key', {
                runId,
                sourceRunId,
                sourceStepNumber: sourceStep.stepNumber,
                idempotencyKey: scopedIdempotencyKey,
                actionType: action.type
            });
            continue;
        }

        try {
            await executeReplayAction(automation, action);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            return {
                type: 'failed',
                reason: `Execution failed at source step ${sourceStep.stepNumber}: ${reason}`,
                replayedCount
            };
        }

        try {
            await dependencies.recoveryReplayIdempotency.markExecuted(runId, scopedIdempotencyKey);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            return {
                type: 'failed',
                reason: `Idempotency write failed at source step ${sourceStep.stepNumber}: ${reason}`,
                replayedCount
            };
        }

        const replayStep: Step = {
            id: uuidv4(),
            runId,
            stepNumber: nextState.stepNumber + 1,
            actionType: action.type,
            actionPayload: action,
            timestamp: new Date().toISOString()
        };

        const saveReplayStepResult = await dependencies.persistence.saveStep(replayStep);
        if (saveReplayStepResult.isErr()) {
            return {
                type: 'failed',
                reason: `Failed to persist replay step at source step ${sourceStep.stepNumber}: ${saveReplayStepResult.error.message}`,
                replayedCount
            };
        }

        nextState = {
            ...nextState,
            stepNumber: nextState.stepNumber + 1,
            history: [...nextState.history, action]
        };
        replayedCount += 1;

        await dependencies.durability.checkpoint(runId, nextState, 'action_applied');
    }

    return { type: 'ok', state: nextState, replayedCount };
}

async function executeReplayAction(automation: IAppAutomation, action: AgentAction): Promise<void> {
    switch (action.type) {
        case ActionType.WAIT: {
            const result = await automation.wait(action.durationMs);
            if (result.isErr()) {
                throw new WorkflowError(`wait failed: ${result.error.message}`);
            }
            return;
        }

        case ActionType.SCROLL: {
            const result = await automation.scroll(action.direction);
            if (result.isErr()) {
                throw new WorkflowError(`scroll failed: ${result.error.message}`);
            }
            return;
        }

        case ActionType.MOUSE_MOVE: {
            const result = await automation.mouseMove(action.x, action.y);
            if (result.isErr()) {
                throw new WorkflowError(`mouse_move failed: ${result.error.message}`);
            }
            return;
        }

        case ActionType.MOUSE_SCROLL: {
            const result = await automation.mouseScroll(action.deltaX, action.deltaY);
            if (result.isErr()) {
                throw new WorkflowError(`mouse_scroll failed: ${result.error.message}`);
            }
            return;
        }

        case ActionType.EXTRACT: {
            const result = await automation.extractText(action.elementId);
            if (result.isErr()) {
                throw new WorkflowError(`extract failed: ${result.error.message}`);
            }
            return;
        }

        case ActionType.OBSERVE:
            // Observe is a perception-only action; during replay there is nothing to execute.
            return;

        case ActionType.NAVIGATE: {
            const urlResult = UrlFactory.create(action.url);
            if (urlResult.isErr()) {
                throw new WorkflowError(`navigate failed: invalid url '${action.url}'`);
            }

            const result = await automation.navigateTo(urlResult.value);
            if (result.isErr()) {
                throw new WorkflowError(`navigate failed: ${result.error.message}`);
            }
            return;
        }

        case ActionType.PASS:
        case ActionType.FAIL:
            return;

        case ActionType.CLICK:
        case ActionType.TYPE:
        case ActionType.PRESS_KEY:
        case ActionType.MOUSE_CLICK_LEFT:
        case ActionType.MOUSE_CLICK_RIGHT:
        case ActionType.MOUSE_DOUBLE_CLICK:
        case ActionType.MOUSE_DRAG:
            throw new WorkflowError(`non-idempotent replay action blocked: ${action.type}`);

        default: {
            const exhaustiveCheck: never = action;
            throw new WorkflowError(`unsupported replay action: ${String(exhaustiveCheck)}`);
        }
    }
}