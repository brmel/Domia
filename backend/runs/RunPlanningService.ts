import { inject, injectable } from 'tsyringe';
import type { IPlanner } from '@domain/ports/agent/IPlanner';
import type { IEventBus } from '@domain/ports/platform/IEventBus';
import type { RunId } from '@domain/value-objects';

export interface IRunPlanning {
    expandGoal(runId: RunId, goal: string): Promise<string>;
}

@injectable()
export class RunPlanningService implements IRunPlanning {
    constructor(
        @inject('IPlanner') private readonly planner: IPlanner,
        @inject('IEventBus') private readonly events: IEventBus,
    ) {}

    async expandGoal(runId: RunId, goal: string): Promise<string> {
        const items = await this.planner.decompose(goal);
        if (items.length <= 1) return goal;
        this.events.emit('plan.created', { runId, itemCount: items.length });
        const numbered = items.map((s, i) => `${i + 1}. ${s}`).join('\n');
        return `${goal}\n\nFollow this plan in order:\n${numbered}`;
    }
}

@injectable()
export class NoopRunPlanning implements IRunPlanning {
    async expandGoal(_runId: RunId, goal: string): Promise<string> {
        return goal;
    }
}
