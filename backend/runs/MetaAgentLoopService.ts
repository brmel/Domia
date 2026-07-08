import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@domain/ports';
import type { RunId } from '@domain/value-objects';
import type { RunInput, RunOutput } from '@backend/dto';
import type { ExecutionController } from '@backend/ExecutionController';
import type { RunExecutionContext } from './engine/RunSessionService';
import { RunUseCase } from './RunUseCase';
import { SubRunCoordinator } from './SubRunCoordinator';
import { supportsSubRuns } from './subRunPlatform';

interface NextPass {
    readonly prompt: string;
    readonly toolCategories: readonly string[] | undefined;
}

@injectable()
export class MetaAgentLoopService {
    constructor(
        @inject(RunUseCase) private readonly runUseCase: RunUseCase,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    async *execute(
        input: RunInput,
        controller: ExecutionController,
        runContext?: RunExecutionContext,
    ): AsyncGenerator<RunOutput, void, unknown> {
        let pass: NextPass = { prompt: input.prompt, toolCategories: input.options?.toolCategories };
        let rootRunId: RunId | null = null;
        let passNumber = 0;

        for (;;) {
            passNumber++;
            let currentRunId: RunId | null = null;
            const subRuns = supportsSubRuns(input.platformConfig)
                ? new SubRunCoordinator(this.runUseCase, input, controller, () => currentRunId, this.logger)
                : undefined;

            let iterating: { summary: string; nextGoal?: string; toolCategories?: readonly string[] } | null = null;
            const passInput = this.buildPassInput(input, pass, rootRunId);

            for await (const output of this.runUseCase.execute(passInput, controller, { ...(runContext ?? {}), ...(subRuns ? { subRuns } : {}) })) {
                if (output.type === 'started') {
                    currentRunId = output.runId;
                    rootRunId ??= output.runId;
                }
                if (output.type === 'iterating') {
                    iterating = output;
                }
                yield output;
            }

            if (subRuns) await this.settleOrphanedChildren(subRuns, passNumber);

            if (!iterating || controller.isStopped()) return;
            pass = {
                prompt: iterating.nextGoal ?? continuationPrompt(input.prompt, iterating.summary),
                toolCategories: iterating.toolCategories ?? pass.toolCategories,
            };
            this.logger.info(`[MetaAgentLoop] Pass ${passNumber} requested iteration; starting pass ${passNumber + 1}`);
        }
    }

    private buildPassInput(input: RunInput, pass: NextPass, rootRunId: RunId | null): RunInput {
        return {
            ...input,
            prompt: pass.prompt,
            options: {
                ...(input.options ?? {}),
                ...(pass.toolCategories ? { toolCategories: [...pass.toolCategories] } : {}),
            },
            ...(rootRunId ? { parentRunId: rootRunId } : {}),
        };
    }

    private async settleOrphanedChildren(subRuns: SubRunCoordinator, passNumber: number): Promise<void> {
        if (subRuns.activeCount() === 0) return;
        this.logger.warn(`[MetaAgentLoop] Pass ${passNumber} ended with ${subRuns.activeCount()} unawaited child run(s); waiting for them`);
        await subRuns.awaitAll();
    }
}

function continuationPrompt(originalGoal: string, lastPassSummary: string): string {
    return `${originalGoal}\n\nA previous pass already worked on this and ended with: ${lastPassSummary}\nContinue from there.`;
}
