import { inject, injectable } from 'tsyringe';
import type { WorkflowDefinition, WorkflowStepDefinition } from '@domain/entities/Workflow';
import { RunUseCase } from '@application/use-cases';
import { ExecutionController } from '@application/controllers/ExecutionController';
import type { PlatformSession } from '@application/services/platform/PlatformSession';
import { PlatformSessionFactory } from '@application/services/platform/PlatformSessionFactory';

export interface WorkflowStepExecutionResult {
    readonly success: boolean;
    readonly summary?: string;
    readonly runId?: string;
}

export interface WorkflowStepRuntimeContext {
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
        let runId: string | undefined;
        let completedSummary: string | undefined;

        const generator = this.runUseCase.execute(
            {
                platformConfig: definition.platformConfig,
                prompt: step.prompt,
                ...(step.options ? { options: step.options } : {})
            },
            controller,
            runtimeContext
                ? {
                    session: runtimeContext.session,
                    shouldNavigate: runtimeContext.shouldNavigate,
                    disposeSessionOnComplete: false
                }
                : undefined
        );

        for await (const event of generator) {
            if (event.type === 'started') {
                runId = event.runId;
            }

            if (event.type === 'completed') {
                completedSummary = event.summary;
                if (!event.success) {
                    return {
                        success: false,
                        ...(event.summary ? { summary: event.summary } : {}),
                        ...(runId ? { runId } : {})
                    };
                }
            }

            if (event.type === 'error') {
                const reason = event.error.message;
                return {
                    success: false,
                    summary: reason,
                    ...(runId ? { runId } : {})
                };
            }
        }

        if (!runId) {
            return {
                success: false,
                summary: `Step ${stepIndex + 1} failed to produce a run id.`
            };
        }

        return {
            success: true,
            ...(completedSummary ? { summary: completedSummary } : {}),
            runId
        };
    }
}