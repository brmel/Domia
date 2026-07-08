import { injectable, inject } from 'tsyringe';
import { WorkflowState } from '@domain/value-objects';
import { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import { ExecutionController } from '@backend/ExecutionController';
import { RunLifecycleManager } from './RunLifecycleManager';
import { RunInput, RunOutput } from '@backend/dto';
import { resolveUrlFromConfig, resolveLaneKeyFromConfig } from '@backend/platform/platformUrlUtils';
import { buildRunExecutionOptions } from './runExecutionOptions';
import { RuntimeReadinessPolicyService } from '@backend/policy/RuntimeReadinessPolicyService';
import type { RunExecutionContext } from './engine/RunSessionService';
import { RunBudgetPolicyService } from './RunBudgetPolicyService';
import { RunPlanCoordinator } from './RunPlanCoordinator';
import { RunControlGateService } from './RunControlGateService';
import type { IRunPlanning } from './RunPlanningService';
import type { IRunEvaluation } from './RunEvaluationService';
import { RunStepEngine } from './engine/RunStepEngine';
import { RunOrchestrationService, type RunFlowContext, type RunFlowResult } from './RunOrchestrationService';
import { ObservationProfile, DEFAULT_OBSERVATION_PROFILE, type RunId } from '@domain/value-objects';
import type { ILogger } from '@domain/ports';

interface BudgetContext {
    budgetLimits: ReturnType<RunBudgetPolicyService['resolveLimits']>;
    runStartMs: number;
    estimatedTokensUsed: number;
}

@injectable()
export class RunUseCase {
    constructor(
        @inject(RunStepEngine) private readonly engine: RunStepEngine,
        @inject(RunOrchestrationService) private readonly orchestration: RunOrchestrationService,
        @inject(RunLifecycleManager) private readonly lifecycleManager: RunLifecycleManager,
        @inject('ITraceService') private readonly trace: import('@domain/ports/reporting/ITraceService').ITraceService,
        @inject(RunBudgetPolicyService) private readonly budgetPolicy: RunBudgetPolicyService,
        @inject(RuntimeReadinessPolicyService) private readonly readinessPolicy: RuntimeReadinessPolicyService,
        @inject(RunPlanCoordinator) private readonly planCoordinator: RunPlanCoordinator,
        @inject(RunControlGateService) private readonly controlGate: RunControlGateService,
        @inject('IRunPlanning') private readonly planning: IRunPlanning,
        @inject('IRunEvaluation') private readonly evaluation: IRunEvaluation,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    async *execute(
        input: RunInput,
        controller: ExecutionController,
        runContext?: RunExecutionContext,
    ): AsyncGenerator<RunOutput, void, unknown> {
        const url = runContext?.session?.executionUrl ?? resolveUrlFromConfig(input.platformConfig);

        const readinessReport = this.readinessPolicy.assess(input, url);
        if (readinessReport.report && !readinessReport.report.passed) {
            this.logger.warn(`[RunUseCase] readiness advisory: ${readinessReport.message ?? readinessReport.report.failedRequiredGateIds.join(', ')}`);
        }

        const budget: BudgetContext = {
            budgetLimits: this.budgetPolicy.resolveLimits(input.options),
            runStartMs: Date.now(),
            estimatedTokensUsed: 0,
        };

        yield* this.orchestration.orchestrate({
            input,
            url,
            laneKey: runContext?.laneKey ?? resolveLaneKeyFromConfig(input.platformConfig),
            stateRef: { current: WorkflowState.initial() },
            vision: input.options?.vision ?? true,
            profile: (input.options?.observationProfile as ObservationProfile | undefined) ?? DEFAULT_OBSERVATION_PROFILE,
            controller,
            ...(runContext ? { runContext } : {}),
            beforeFinalize: () => this.trace.endTrace(),
            initRun: async () => this.lifecycleManager.initializeRun(url, input.prompt, {
                platformConfigJson: JSON.stringify(input.platformConfig),
                ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
            }) as Promise<import('neverthrow').Result<RunId, Error>>,
            announce: async (ctx) => {
                await this.engine.checkpoint(ctx.runId, ctx.stateRef.current, CheckpointReason.RunInitialized);
                return [{ type: 'started', runId: ctx.runId }];
            },
            runFlow: (ctx) => this.freshFlow(ctx, input, controller, budget, runContext),
        });
    }

    private async *freshFlow(
        ctx: RunFlowContext,
        input: RunInput,
        controller: ExecutionController,
        budget: BudgetContext,
        runContext?: RunExecutionContext,
    ): AsyncGenerator<RunOutput, RunFlowResult, unknown> {
        ctx.stateRef.current = WorkflowState.transitionTo(ctx.stateRef.current, 'thinking');
        yield { type: 'state_updated', state: ctx.stateRef.current };

        const goalForPlan = await this.planning.expandGoal(ctx.runId, input.prompt);
        const { plan, item } = this.planCoordinator.buildSinglePromptPlan(goalForPlan);

        ctx.stateRef.current = WorkflowState.transitionTo(ctx.stateRef.current, 'thinking', { plan });
        yield { type: 'state_updated', state: ctx.stateRef.current };
        await this.engine.checkpoint(ctx.runId, ctx.stateRef.current, CheckpointReason.PlanReady);

        const gate = await this.controlGate.evaluate(ctx.runId, ctx.stateRef.current, controller);
        if (gate.kind === 'cancelled') {
            return { outcome: gate.outcome, suspendedReason: null, completed: true };
        }

        const activated = this.planCoordinator.activate(ctx.stateRef.current, plan, item);
        ctx.stateRef.current = activated.state;
        yield { type: 'state_updated', state: ctx.stateRef.current };

        const executionOptions = buildRunExecutionOptions({
            options: input.options,
            platform: input.platformConfig.platform,
            sessionExtras: ctx.preparedSession.sessionExtras,
            observation: ctx.observation,
            controller,
            ...(runContext?.subRuns ? { subRuns: runContext.subRuns } : {}),
        });

        const kernelResult = yield* this.engine.executeStep(
            ctx.runId,
            item.description,
            ctx.automation,
            ctx.url,
            ctx.stateRef.current,
            executionOptions,
            budget,
            controller,
        );

        ctx.stateRef.current = kernelResult.state;
        budget.estimatedTokensUsed = kernelResult.estimatedTokensUsed;
        const outcome = kernelResult.outcome;

        if (kernelResult.suspendedReason) {
            return { outcome, suspendedReason: kernelResult.suspendedReason, completed: false };
        }

        ctx.stateRef.current = this.planCoordinator.applyOutcome(ctx.stateRef.current, plan, activated.runningItem, outcome);
        yield { type: 'state_updated', state: ctx.stateRef.current };
        if (outcome?.kind === 'done') {
            await this.evaluation.evaluate(ctx.runId, input.prompt, outcome.output.summary);
        }
        return { outcome, suspendedReason: null, completed: true };
    }
}
