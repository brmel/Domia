
type PlanStatus = 'executing' | 'completed' | 'failed';
type PlanItemStatus = 'pending' | 'active' | 'completed' | 'failed';
type PlanItemType = 'general' | 'vision' | 'code' | 'app';

export interface PlanItem {
    id: string;
    description: string;
    status: PlanItemStatus;
    type: PlanItemType;
    metadata?: Record<string, unknown>;
    error?: string;
}

export const PlanItem = {
    activate(item: PlanItem): PlanItem {
        if (item.status !== 'pending') {
            throw new Error(`Cannot activate a plan item in '${item.status}' state`);
        }
        return { ...item, status: 'active' };
    },

    complete(item: PlanItem): PlanItem {
        if (item.status !== 'active') {
            throw new Error(`Cannot complete a plan item in '${item.status}' state`);
        }
        return { ...item, status: 'completed' };
    },

    fail(item: PlanItem, error?: string): PlanItem {
        if (item.status !== 'active') {
            throw new Error(`Cannot fail a plan item in '${item.status}' state`);
        }
        return { ...item, status: 'failed', ...(error ? { error } : {}) };
    }
};

export interface Plan {
    id: string;
    goal: string;
    items: PlanItem[];
    status: PlanStatus;
    createdAt: Date;
    updatedAt: Date;
}
