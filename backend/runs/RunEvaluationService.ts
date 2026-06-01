import { inject, injectable } from 'tsyringe';
import type { IEvaluator, EvaluationVerdict } from '@domain/ports/agent/IEvaluator';
import type { IEventBus } from '@domain/ports/platform/IEventBus';
import type { ILogger } from '@domain/ports';
import type { RunId } from '@domain/value-objects';

/** Advisory reflection pass, gated by DOMIA_EVALUATOR: emits run.evaluated, logs an unmet goal, never throws. */
@injectable()
export class RunEvaluationService {
    constructor(
        @inject('IEvaluator') private readonly evaluator: IEvaluator,
        @inject('IEventBus') private readonly events: IEventBus,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    get enabled(): boolean {
        return Boolean(process.env['DOMIA_EVALUATOR']);
    }

    async evaluate(runId: RunId, goal: string, resultSummary: string): Promise<EvaluationVerdict> {
        const verdict = await this.evaluator.evaluate(goal, resultSummary);
        this.events.emit('run.evaluated', { runId, satisfied: verdict.satisfied, reason: verdict.reason });
        if (!verdict.satisfied) {
            this.logger.info(`[RunEvaluationService] goal not satisfied: ${verdict.reason}`, { runId: String(runId) });
        }
        return verdict;
    }
}
