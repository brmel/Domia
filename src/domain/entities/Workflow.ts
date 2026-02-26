import type { PlatformConfig } from '@domain/types/PlatformConfig';
import type { RunOptions } from '@domain/types/RunOptions';

export type WorkflowStatus = 'draft' | 'published';

export interface WorkflowStepDefinition {
    readonly id: string;
    readonly name: string;
    readonly prompt: string;
    readonly continueOnFailure: boolean;
    readonly options?: RunOptions;
}

export interface WorkflowDefinition {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly status: WorkflowStatus;
    readonly version: number;
    readonly platformConfig: PlatformConfig;
    readonly steps: readonly WorkflowStepDefinition[];
    readonly createdAt: string;
    readonly updatedAt: string;
}

export type WorkflowRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface WorkflowRunRecord {
    readonly id: string;
    readonly workflowDefinitionId: string;
    readonly workflowVersion: number;
    readonly status: WorkflowRunStatus;
    readonly summary?: string;
    readonly startedAt: string;
    readonly completedAt?: string;
}

export const WorkflowRunRecord = {
    create(params: { id: string; workflowDefinitionId: string; workflowVersion: number }): WorkflowRunRecord {
        return {
            id: params.id,
            workflowDefinitionId: params.workflowDefinitionId,
            workflowVersion: params.workflowVersion,
            status: 'running',
            startedAt: new Date().toISOString()
        };
    },

    complete(record: WorkflowRunRecord, summary?: string): WorkflowRunRecord {
        if (record.status !== 'running') {
            throw new Error(`Cannot complete a workflow run in '${record.status}' state`);
        }
        return { ...record, status: 'completed', ...(summary !== undefined ? { summary } : {}), completedAt: new Date().toISOString() };
    },

    fail(record: WorkflowRunRecord, summary?: string): WorkflowRunRecord {
        if (record.status !== 'running') {
            throw new Error(`Cannot fail a workflow run in '${record.status}' state`);
        }
        return { ...record, status: 'failed', ...(summary !== undefined ? { summary } : {}), completedAt: new Date().toISOString() };
    },

    cancel(record: WorkflowRunRecord, summary?: string): WorkflowRunRecord {
        if (record.status !== 'running') {
            throw new Error(`Cannot cancel a workflow run in '${record.status}' state`);
        }
        return { ...record, status: 'cancelled', ...(summary !== undefined ? { summary } : {}), completedAt: new Date().toISOString() };
    }
};

export type WorkflowStepRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface WorkflowStepRunRecord {
    readonly id: string;
    readonly workflowRunId: string;
    readonly stepId: string;
    readonly stepIndex: number;
    readonly runId?: string;
    readonly status: WorkflowStepRunStatus;
    readonly summary?: string;
    readonly startedAt: string;
    readonly completedAt?: string;
}

export const WorkflowStepRunRecord = {
    create(params: { id: string; workflowRunId: string; stepId: string; stepIndex: number }): WorkflowStepRunRecord {
        return {
            id: params.id,
            workflowRunId: params.workflowRunId,
            stepId: params.stepId,
            stepIndex: params.stepIndex,
            status: 'running',
            startedAt: new Date().toISOString()
        };
    },

    complete(record: WorkflowStepRunRecord, summary?: string): WorkflowStepRunRecord {
        if (record.status !== 'running') {
            throw new Error(`Cannot complete a workflow step in '${record.status}' state`);
        }
        return { ...record, status: 'completed', ...(summary !== undefined ? { summary } : {}), completedAt: new Date().toISOString() };
    },

    fail(record: WorkflowStepRunRecord, summary?: string): WorkflowStepRunRecord {
        if (record.status !== 'running') {
            throw new Error(`Cannot fail a workflow step in '${record.status}' state`);
        }
        return { ...record, status: 'failed', ...(summary !== undefined ? { summary } : {}), completedAt: new Date().toISOString() };
    }
};
