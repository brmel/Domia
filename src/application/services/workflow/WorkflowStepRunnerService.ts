import { inject, injectable } from 'tsyringe';
import type { WorkflowDefinition, WorkflowStepDefinition } from '@domain/entities/Workflow';
import { RunTestUseCase } from '@application/use-cases';
import { ExecutionController } from '@application/controllers/ExecutionController';

export interface WorkflowStepExecutionResult {
    readonly success: boolean;
    readonly summary?: string;
    readonly testRunId?: string;
}

@injectable()
export class WorkflowStepRunnerService {
    constructor(@inject(RunTestUseCase) private readonly runTestUseCase: RunTestUseCase) {}

    async runStep(
        step: WorkflowStepDefinition,
        stepIndex: number,
        definition: WorkflowDefinition,
        controller: ExecutionController
    ): Promise<WorkflowStepExecutionResult> {
        let testRunId: string | undefined;
        let completedSummary: string | undefined;

        const generator = this.runTestUseCase.execute(
            {
                platformConfig: definition.platformConfig,
                prompt: step.prompt,
                ...(step.options ? { options: step.options } : {})
            },
            controller
        );

        for await (const event of generator) {
            if (event.type === 'started') {
                testRunId = event.testRunId;
            }

            if (event.type === 'completed') {
                completedSummary = event.summary;
                if (!event.success) {
                    return {
                        success: false,
                        ...(event.summary ? { summary: event.summary } : {}),
                        ...(testRunId ? { testRunId } : {})
                    };
                }
            }

            if (event.type === 'error') {
                const reason = event.error.message;
                return {
                    success: false,
                    summary: reason,
                    ...(testRunId ? { testRunId } : {})
                };
            }
        }

        if (!testRunId) {
            return {
                success: false,
                summary: `Step ${stepIndex + 1} failed to produce a test run id.`
            };
        }

        return {
            success: true,
            ...(completedSummary ? { summary: completedSummary } : {}),
            testRunId
        };
    }
}