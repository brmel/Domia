import { injectable, inject } from 'tsyringe';
import { ResultAsync, okAsync } from 'neverthrow';
import { v4 as uuidv4 } from 'uuid';
import { Plan, PlanItem } from '../../domain/entities/Plan';
import type { ILogger } from '../../domain/ports/ILogger';

@injectable()
export class PlannerService {
    constructor(
        @inject('ILogger') private logger: ILogger
    ) { }

    /**
     * Generates an initial plan based on the user's high-level goal.
     * Currently uses a simpleheuristic or LLM.
     */
    createPlan(goal: string): ResultAsync<Plan, Error> {
        this.logger.info(`[PlannerService] Creating plan for goal: ${goal}`);

        // For now, we create a simple 1-step plan as a placeholder until the LLM Planner is fully implemented.
        // In the future, this will call the LLM to generate a tree.
        const initialItem: PlanItem = {
            id: uuidv4(),
            description: goal, // Treat the whole goal as one item for now
            status: 'pending',
            type: 'general'
        };

        const plan: Plan = {
            id: uuidv4(),
            goal,
            items: [initialItem],
            status: 'planning',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        return okAsync(plan);
    }

    /**
     * Updates the status of a plan item.
     */
    updateItemStatus(plan: Plan, itemId: string, status: PlanItem['status']): ResultAsync<Plan, Error> {
        // localized update logic (deep tree traversal would be needed for nested items)
        const updateRecursive = (items: PlanItem[]): boolean => {
            for (const item of items) {
                if (item.id === itemId) {
                    item.status = status;
                    return true;
                }
                if (item.subItems && updateRecursive(item.subItems)) {
                    return true;
                }
            }
            return false;
        };

        updateRecursive(plan.items);
        plan.updatedAt = new Date();
        return okAsync(plan);
    }
}
