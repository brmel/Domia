import { inject, injectable } from 'tsyringe';
import type { IPlanner } from '@domain/ports/agent/IPlanner';
import type { IEventBus } from '@domain/ports/platform/IEventBus';
import type { RunId } from '@domain/value-objects';

/** Goal decomposition for a run, gated by DOMIA_PLANNER. Emits plan.created; never throws (planner falls back to [goal]). */
@injectable()
export class RunPlanningService {
    constructor(
        @inject('IPlanner') private readonly planner: IPlanner,
        @inject('IEventBus') private readonly events: IEventBus,
    ) {}

    get enabled(): boolean {
        return Boolean(process.env['DOMIA_PLANNER']);
    }

    async plan(runId: RunId, goal: string): Promise<readonly string[]> {
        const items = await this.planner.decompose(goal);
        this.events.emit('plan.created', { runId, itemCount: items.length });
        return items;
    }
}
