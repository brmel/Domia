import { initTRPC } from '@trpc/server';
import { EventEmitter } from 'events';
import { ExecutionController } from '@backend/ExecutionController';
import type { RunInput, RunOutput } from '@backend/dto';
import type { RunUseCase } from '@backend/runs';
import type { RunResumeService } from '@backend/runs/RunResumeService';
import type { RunId } from '@domain/value-objects';
import { serializeRunOutput } from './serializeRunOutput';

export const t = initTRPC.create({ isServer: true });
export const eventEmitter = new EventEmitter();
eventEmitter.setMaxListeners(50);

export const activeRunState = {
    current: null as ExecutionController | null,
    executionToken: 0,
};

export const workflowControllerState = {
    current: null as ExecutionController | null,
    executionToken: 0,
};

function consumeRunGenerator(generator: AsyncGenerator<RunOutput, void, unknown>, executionToken: number): void {
    void (async () => {
        try {
            for await (const event of generator) {
                if (executionToken !== activeRunState.executionToken) return;
                eventEmitter.emit('test:update', serializeRunOutput(event));
            }
        } catch (err) {
            if (executionToken !== activeRunState.executionToken) return;
            const errorPayload: RunOutput = {
                type: 'error',
                error: err instanceof Error ? err : new Error(String(err)),
            };
            eventEmitter.emit('test:update', serializeRunOutput(errorPayload));
        } finally {
            if (executionToken === activeRunState.executionToken) activeRunState.current = null;
        }
    })();
}

export function startRunStream(useCase: RunUseCase, input: RunInput): void {
    if (activeRunState.current) activeRunState.current.stop();
    activeRunState.current = new ExecutionController();
    activeRunState.current.start();
    activeRunState.executionToken += 1;
    consumeRunGenerator(useCase.execute(input, activeRunState.current), activeRunState.executionToken);
}

export function startResumeStream(resumeService: RunResumeService, runId: RunId): void {
    if (activeRunState.current) activeRunState.current.stop();
    activeRunState.current = new ExecutionController();
    activeRunState.current.start();
    activeRunState.executionToken += 1;
    consumeRunGenerator(resumeService.execute(runId, activeRunState.current), activeRunState.executionToken);
}
