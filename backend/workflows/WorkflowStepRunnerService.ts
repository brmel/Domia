import { inject, injectable } from 'tsyringe';
import type { WorkflowDefinition, WorkflowStepDefinition, AgentWorkflowStep, ForEachWorkflowStep } from '@domain/entities/Workflow';
import { WorkflowStepKind } from '@domain/value-objects/WorkflowStepKind';
import { interpolate } from '@shared/reliability/interpolate';
import { RunUseCase } from '@backend/runs';
import { ExecutionController } from '@backend/ExecutionController';
import type { PlatformSession } from '@backend/platform/PlatformSession';
import { PlatformSessionFactory } from '@backend/platform/PlatformSessionFactory';

interface WorkflowStepExecutionResult {
    readonly success: boolean;
    readonly summary?: string;
    readonly runId?: string;
    readonly subRunIds?: readonly string[];
}

interface WorkflowStepRuntimeContext {
    readonly session: PlatformSession;
    readonly shouldNavigate: boolean;
}

@injectable()
export class WorkflowStepRunnerService {
    constructor(
        @inject(RunUseCase) private readonly runUseCase: RunUseCase,
        @inject(PlatformSessionFactory) private readonly sessionFactory: PlatformSessionFactory
    ) {}

    async openSharedSession(definition: WorkflowDefinition): Promise<PlatformSession> {
        return this.sessionFactory.createSession({
            platformConfig: definition.platformConfig,
            prompt: definition.name
        });
    }

    async runStep(
        step: WorkflowStepDefinition,
        stepIndex: number,
        definition: WorkflowDefinition,
        controller: ExecutionController,
        runtimeContext?: WorkflowStepRuntimeContext
    ): Promise<WorkflowStepExecutionResult> {
        if (step.kind === WorkflowStepKind.ForEach) {
            return this.runForEachStep(step, stepIndex, definition, controller, runtimeContext);
        }
        return this.runAgentStep(step, stepIndex, step.prompt, definition, controller, runtimeContext);
    }

    private async runAgentStep(
        step: AgentWorkflowStep | ForEachWorkflowStep,
        stepIndex: number,
        prompt: string,
        definition: WorkflowDefinition,
        controller: ExecutionController,
        runtimeContext?: WorkflowStepRuntimeContext,
    ): Promise<WorkflowStepExecutionResult> {
        let runId: string | undefined;
        let completedSummary: string | undefined;

        const generator = this.runUseCase.execute(
            {
                platformConfig: definition.platformConfig,
                prompt,
                ...(step.options ? { options: step.options } : {}),
            },
            controller,
            runtimeContext
                ? { session: runtimeContext.session, shouldNavigate: runtimeContext.shouldNavigate, disposeSessionOnComplete: false }
                : undefined
        );

        for await (const event of generator) {
            if (event.type === 'started') runId = event.runId;
            if (event.type === 'completed' && !event.success) {
                return {
                    success: false,
                    ...(event.summary ? { summary: event.summary } : {}),
                    ...(runId ? { runId } : {}),
                };
            }
            if (event.type === 'completed') completedSummary = event.summary;
            if (event.type === 'error') {
                return { success: false, summary: event.error.message, ...(runId ? { runId } : {}) };
            }
        }

        if (!runId) return { success: false, summary: `Step ${stepIndex + 1} failed to produce a run id.` };
        return { success: true, ...(completedSummary ? { summary: completedSummary } : {}), runId };
    }

    private async runForEachStep(
        step: ForEachWorkflowStep,
        stepIndex: number,
        definition: WorkflowDefinition,
        controller: ExecutionController,
        runtimeContext?: WorkflowStepRuntimeContext,
    ): Promise<WorkflowStepExecutionResult> {
        const subRunIds: string[] = [];
        const summaries: string[] = [];
        for (let i = 0; i < step.items.length; i++) {
            const item = step.items[i]!;
            const prompt = interpolate(step.bodyPrompt, { $item: item, $index: i });
            const result = await this.runAgentStep(step, stepIndex, prompt, definition, controller, runtimeContext);
            if (result.runId) subRunIds.push(result.runId);
            if (result.summary) summaries.push(`[${i + 1}/${step.items.length}] ${result.summary}`);
            if (!result.success && !step.continueOnFailure) {
                return {
                    success: false,
                    summary: `for-each item ${i + 1}/${step.items.length} failed: ${result.summary ?? 'unknown'}`,
                    subRunIds,
                };
            }
        }
        return { success: true, summary: summaries.join('\n'), subRunIds };
    }
}