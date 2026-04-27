import type { PlatformConfig } from '@domain/types/PlatformConfig';
import type { RunOptions } from '@shared/contracts/run';
import type { WorkflowStepKind } from '@domain/value-objects/WorkflowStepKind';

type WorkflowStatus = 'draft' | 'published';

export interface AgentWorkflowStep {
    readonly kind: typeof WorkflowStepKind.Agent;
    readonly id: string;
    readonly name: string;
    readonly prompt: string;
    readonly continueOnFailure: boolean;
    readonly options?: RunOptions;
}

export interface ForEachWorkflowStep {
    readonly kind: typeof WorkflowStepKind.ForEach;
    readonly id: string;
    readonly name: string;
    readonly items: readonly string[];
    readonly bodyPrompt: string;
    readonly continueOnFailure: boolean;
    readonly options?: RunOptions;
}

export type WorkflowStepDefinition = AgentWorkflowStep | ForEachWorkflowStep;

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

type WorkflowRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface WorkflowRunRecord {
    readonly id: string;
    readonly workflowDefinitionId: string;
    readonly workflowVersion: number;
    readonly status: WorkflowRunStatus;
    readonly summary?: string;
    readonly startedAt: string;
    readonly completedAt?: string;
}

type WorkflowStepRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

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
