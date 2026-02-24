
export type PlanStatus = 'planning' | 'executing' | 'completed' | 'failed';
export type PlanItemStatus = 'pending' | 'active' | 'completed' | 'failed';
export type PlanItemType = 'general' | 'vision' | 'code' | 'browser';

export interface PlanItemContract {
    objective: string;
    successCriteria: readonly string[];
    evidenceExpectations: readonly string[];
    constraints: readonly string[];
}

export interface PlanItem {
    id: string;
    description: string;
    status: PlanItemStatus;
    type: PlanItemType;
    contract?: PlanItemContract;
    subItems?: PlanItem[];
    metadata?: Record<string, unknown>;
    result?: string; // Output of this step
    error?: string;
}

export const PlanItem = {
    activate(item: PlanItem): PlanItem {
        if (item.status !== 'pending') {
            throw new Error(`Cannot activate a plan item in '${item.status}' state`);
        }
        return { ...item, status: 'active' };
    },

    complete(item: PlanItem, result?: string): PlanItem {
        if (item.status !== 'active') {
            throw new Error(`Cannot complete a plan item in '${item.status}' state`);
        }
        return { ...item, status: 'completed', ...(result ? { result } : {}) };
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
