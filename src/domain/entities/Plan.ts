
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

export interface Plan {
    id: string;
    goal: string;
    items: PlanItem[];
    status: PlanStatus;
    createdAt: Date;
    updatedAt: Date;
}
