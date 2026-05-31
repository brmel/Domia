import { inject, injectable } from 'tsyringe';
import type { IRunRepository } from '@domain/ports/persistence/IRunRepository';
import type { SkillStep } from '@domain/entities/Skill';
import { ActionType } from '@domain/enums';

const NON_REPLAYABLE: ReadonlySet<ActionType> = new Set([
    ActionType.OBSERVE,
    ActionType.WAIT_FOR_CONDITION,
    ActionType.WAIT_FOR_URL,
    ActionType.START_RECORDING,
    ActionType.STOP_AND_REVIEW_RECORDING,
    ActionType.FINISH,
]);

@injectable()
export class SkillExtractionService {
    constructor(
        @inject('IRunRepository') private readonly runs: IRunRepository,
    ) {}

    async fromRun(runId: string): Promise<readonly SkillStep[]> {
        const stepsResult = await this.runs.getSteps(runId);
        if (stepsResult.isErr()) throw stepsResult.error;
        const steps = stepsResult.value;

        return steps
            .filter((s) => !NON_REPLAYABLE.has(s.actionType))
            .map((s): SkillStep => ({
                actionType: s.actionType,
                params: (s.actionPayload as unknown as Record<string, unknown>) ?? {},
            }));
    }
}
