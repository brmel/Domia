import { inject, injectable } from 'tsyringe';
import type { IEvaluator } from '@domain/ports/agent/IEvaluator';
import type { IEventBus } from '@domain/ports/platform/IEventBus';
import type { ILogger } from '@domain/ports';
import type { RunId } from '@domain/value-objects';

export interface IRunEvaluation {
    evaluate(runId: RunId, goal: string, resultSummary: string): Promise<void>;
}

@injectable()
export class RunEvaluationService implements IRunEvaluation {
    constructor(
        @inject('IEvaluator') private readonly evaluator: IEvaluator,
        @inject('IEventBus') private readonly events: IEventBus,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    async evaluate(runId: RunId, goal: string, resultSummary: string): Promise<void> {
        const verdict = await this.evaluator.evaluate(goal, resultSummary);
        this.events.emit('run.evaluated', { runId, satisfied: verdict.satisfied, reason: verdict.reason });
        if (!verdict.satisfied) {
            this.logger.info(`[RunEvaluationService] goal not satisfied: ${verdict.reason}`, { runId: String(runId) });
        }
    }
}

@injectable()
export class NoopRunEvaluation implements IRunEvaluation {
    async evaluate(): Promise<void> {}
}
