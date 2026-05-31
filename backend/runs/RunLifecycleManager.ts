import { injectable, inject } from 'tsyringe';
import { Result, ok, err } from 'neverthrow';
import { RunIdFactory, RunId, UrlFactory } from '@domain/value-objects';
import { Run } from '@domain/entities/Run';
import type { IRunRepository } from '@domain/ports/persistence/IRunRepository';
import type { IEventBus } from '@domain/ports/platform/IEventBus';
import type { ILogger } from '@domain/ports';
import type { AgentOutcome, AgentVerdict } from '@domain/ports/agent/IAgentRuntime';
import { ValidationError, PersistenceError } from '@domain/errors';

interface FinalizedRun {
    readonly run: Run;
    readonly success: boolean;
}

const VERDICT_HANDLERS: Record<AgentVerdict | 'finish', (existing: Run, summary: string, value?: unknown) => FinalizedRun> = {
    pass: (existing, summary) => ({ run: Run.pass(existing, summary), success: true }),
    fail: (existing, summary) => ({ run: Run.fail(existing, summary), success: false }),
    finish: (existing, summary, value) => ({ run: Run.finish(existing, summary, value), success: true }),
};

@injectable()
export class RunLifecycleManager {
    constructor(
        @inject('IRunRepository') private readonly persistence: IRunRepository,
        @inject('IEventBus') private readonly events: IEventBus,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    async initializeRun(
        urlString: string,
        prompt: string,
        opts?: { platformConfigJson?: string; parentRunId?: RunId },
    ): Promise<Result<RunId, ValidationError | PersistenceError>> {
        const id = RunIdFactory.create();
        const urlResult = UrlFactory.create(urlString);
        if (urlResult.isErr()) {
            return err(new ValidationError(`Invalid URL: ${urlResult.error.message}`, 'url'));
        }

        const runningRun = Run.start(Run.create({
            id,
            url: urlResult.value,
            prompt,
            ...(opts?.parentRunId ? { parentRunId: opts.parentRunId } : {}),
        }));
        try {
            await this.persistence.saveRun(runningRun, opts?.platformConfigJson);
            this.events.emit('run.started', { runId: id, url: urlString, prompt });
            return ok(id);
        } catch (error) {
            return err(new PersistenceError(`Failed to save run: ${error}`, error));
        }
    }

    async finalizeRun(id: RunId, outcome: AgentOutcome | undefined, fallbackSummary: string): Promise<void> {
        const existingResult = await this.persistence.getRun(id);
        if (existingResult.isErr() || !existingResult.value) {
            this.logger.warn(`Cannot finalize run ${id}`);
            return;
        }
        const existing = existingResult.value;
        const summary = outcome?.kind === 'done' ? (outcome.output.summary || fallbackSummary) : fallbackSummary;

        const handlerKey = outcome?.kind === 'done' ? (outcome.output.verdict ?? 'finish') : 'fail';
        const value = outcome?.kind === 'done' ? outcome.output.value : undefined;
        const { run: finalized, success } = VERDICT_HANDLERS[handlerKey](existing, summary, value);

        await this.persistence.updateRun(id, { status: finalized.status, updatedAt: finalized.updatedAt });
        this.events.emit('run.completed', { runId: id, success, summary });
    }

    async failRun(id: RunId, message: string): Promise<void> {
        const existingResult = await this.persistence.getRun(id);
        if (existingResult.isErr() || !existingResult.value) {
            this.logger.warn(`Cannot fail run ${id}`);
            return;
        }
        const failed = Run.fail(existingResult.value, message);
        await this.persistence.updateRun(id, { status: failed.status, updatedAt: failed.updatedAt });
        this.events.emit('run.failed', { runId: id, error: message });
    }
}
