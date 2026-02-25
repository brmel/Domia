import { injectable } from 'tsyringe';
import type { Plan } from '@domain/entities/Plan';
import { nanoid } from 'nanoid';

@injectable()
export class PlanningCoordinator {
    buildSingleStepPlan(prompt: string): Plan {
        const now = new Date();

        return {
            id: nanoid(),
            goal: prompt,
            status: 'planning',
            createdAt: now,
            updatedAt: now,
            items: [
                {
                    id: nanoid(),
                    description: prompt,
                    status: 'pending',
                    type: 'app'
                }
            ]
        };
    }
}
