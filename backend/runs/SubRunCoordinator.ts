import { randomUUID } from 'crypto';
import type { ISubRunLauncher, SubRunHandle, SubRunRequest, SubRunResult, ILogger } from '@domain/ports';
import type { RunId } from '@domain/value-objects';
import type { RunInput, RunOutput } from '@backend/dto';
import type { ExecutionController } from '@backend/ExecutionController';
import type { RunExecutionContext } from './engine/RunSessionService';
import { isolatedChildConfig } from './subRunPlatform';

export interface SubRunRunner {
    execute(
        input: RunInput,
        controller: ExecutionController,
        runContext?: RunExecutionContext,
    ): AsyncGenerator<RunOutput, void, unknown>;
}

export class SubRunCoordinator implements ISubRunLauncher {
    private readonly pending = new Map<string, Promise<SubRunResult>>();

    constructor(
        private readonly runner: SubRunRunner,
        private readonly baseInput: RunInput,
        private readonly parentController: ExecutionController,
        private readonly parentRunId: () => RunId | null,
        private readonly logger: ILogger,
    ) {}

    async spawn(request: SubRunRequest): Promise<SubRunHandle> {
        const controller = this.parentController.spawnChild();
        const input = await this.childInput(request);
        const generator = this.runner.execute(input, controller, { laneKey: `subrun:${randomUUID()}` });

        const runId = await this.driveUntilStarted(generator);
        this.pending.set(runId, this.drain(generator, runId, request.goal, controller));
        this.logger.info(`[SubRunCoordinator] Spawned child run ${runId} (${this.pending.size} active)`);
        return { runId };
    }

    awaitAll(): Promise<readonly SubRunResult[]> {
        const settling = [...this.pending.values()];
        this.pending.clear();
        return Promise.all(settling);
    }

    activeCount(): number {
        return this.pending.size;
    }

    private async childInput(request: SubRunRequest): Promise<RunInput> {
        const parentRunId = this.parentRunId();
        return {
            platformConfig: await isolatedChildConfig(this.baseInput.platformConfig, request.url),
            prompt: request.goal,
            ...(this.baseInput.options ? { options: this.baseInput.options } : {}),
            ...(parentRunId ? { parentRunId } : {}),
        };
    }

    private async driveUntilStarted(generator: AsyncGenerator<RunOutput, void, unknown>): Promise<string> {
        for (;;) {
            const next = await generator.next();
            if (next.done) throw new Error('Child run ended before starting');
            if (next.value.type === 'error') {
                const message = next.value.error.message;
                await generator.return();
                throw new Error(`Child run failed to start: ${message}`);
            }
            if (next.value.type === 'started') return next.value.runId;
        }
    }

    private async drain(
        generator: AsyncGenerator<RunOutput, void, unknown>,
        runId: string,
        goal: string,
        controller: ExecutionController,
    ): Promise<SubRunResult> {
        let successful = false;
        let summary = 'Child run produced no terminal event';
        try {
            for await (const output of generator) {
                if (output.type === 'completed') {
                    successful = output.success;
                    summary = output.summary ?? '';
                } else if (output.type === 'cancelled') {
                    summary = output.summary ?? 'Cancelled';
                } else if (output.type === 'suspended') {
                    summary = `Suspended: ${output.reason}`;
                } else if (output.type === 'error') {
                    summary = output.error.message;
                }
            }
        } catch (error) {
            summary = error instanceof Error ? error.message : String(error);
        } finally {
            this.parentController.releaseChild(controller);
        }
        return { runId, goal, successful, summary };
    }
}

