import { injectable, inject } from 'tsyringe';
import { Result, ok, err } from 'neverthrow';
import { RunIdFactory, RunId, UrlFactory } from '@domain/value-objects';
import { Run } from '@domain/entities/Run';
import type { IRunRepository } from '@domain/ports/persistence/IRunRepository';
import type { IEventBus } from '@domain/ports/platform/IEventBus';
import type { ILogger } from '@domain/ports';
import type { AgentOutcome, AgentVerdict } from '@domain/ports/agent/IAgentRuntime';
import { ValidationError, PersistenceError, RunStateError } from '@domain/errors';

interface FinalizedRun {
    readonly run: Run;
    readonly success: boolean;
}

const VERDICT_HANDLERS: Record<
    AgentVerdict | 'finish',
    (existing: Run, summary: string, now: Date, value?: unknown) => Result<FinalizedRun, RunStateError>
> = {
    pass: (existing, summary, now) => Run.pass(existing, summary, now).map((run) => ({ run, success: true })),
    fail: (existing, summary, now) => Run.fail(existing, summary, now).map((run) => ({ run, success: false })),
    finish: (existing, summary, now, value) => Run.finish(existing, summary, now, value).map((run) => ({ run, success: true })),
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
    ): Promise<Result<RunId, ValidationError | RunStateError | PersistenceError>> {
        const id = RunIdFactory.create();
        const urlResult = UrlFactory.create(urlString);
        if (urlResult.isErr()) {
            return err(new ValidationError(`Invalid URL: ${urlResult.error.message}`, 'url'));
        }

        const now = new Date();
        const startResult = Run.start(Run.create({
            id,
            url: urlResult.value,
            prompt,
            ...(opts?.parentRunId ? { parentRunId: opts.parentRunId } : {}),
        }, now), now);
        if (startResult.isErr()) {
            return err(startResult.error);
        }
        const saveResult = await this.persistence.saveRun(startResult.value, opts?.platformConfigJson);
        if (saveResult.isErr()) {
            return err(saveResult.error);
        }
        this.events.emit('run.started', { runId: id, url: urlString, prompt });
        return ok(id);
    }

    async finalizeRun(id: RunId, outcome: AgentOutcome | undefined, fallbackSummary: string): Promise<void> {
        const existingResult = await this.persistence.getRun(id);
        if (existingResult.isErr() || !existingResult.value) {
            this.logger.warn(`Cannot finalize run ${id}`);
            return;
        }
        const existing = existingResult.value;
        const summary = outcome?.kind === 'done' ? (outcome.output.summary || fallbackSummary)
            : outcome?.kind === 'iterate' ? (outcome.summary || fallbackSummary)
            : fallbackSummary;

        const handlerKey = outcome?.kind === 'done' ? (outcome.output.verdict ?? 'finish')
            : outcome?.kind === 'iterate' ? 'finish'
            : 'fail';
        const value = outcome?.kind === 'done' ? outcome.output.value : undefined;
        const finalizedResult = VERDICT_HANDLERS[handlerKey](existing, summary, new Date(), value);
        if (finalizedResult.isErr()) {
            this.logger.warn(`Cannot finalize run ${id}: ${finalizedResult.error.message}`);
            return;
        }
        const { run: finalized, success } = finalizedResult.value;

        const updateResult = await this.persistence.updateRun(id, { status: finalized.status, updatedAt: finalized.updatedAt });
        if (updateResult.isErr()) {
            this.logger.warn(`Failed to persist finalize for run ${id}: ${updateResult.error.message}`);
        }
        this.events.emit('run.completed', { runId: id, success, summary });
    }

    async failRun(id: RunId, message: string): Promise<void> {
        const existingResult = await this.persistence.getRun(id);
        if (existingResult.isErr() || !existingResult.value) {
            this.logger.warn(`Cannot fail run ${id}`);
            return;
        }
        const failedResult = Run.fail(existingResult.value, message, new Date());
        if (failedResult.isErr()) {
            this.logger.warn(`Cannot fail run ${id}: ${failedResult.error.message}`);
            return;
        }
        const failed = failedResult.value;
        const updateResult = await this.persistence.updateRun(id, { status: failed.status, updatedAt: failed.updatedAt });
        if (updateResult.isErr()) {
            this.logger.warn(`Failed to persist failure for run ${id}: ${updateResult.error.message}`);
        }
        this.events.emit('run.failed', { runId: id, error: message });
    }
}
