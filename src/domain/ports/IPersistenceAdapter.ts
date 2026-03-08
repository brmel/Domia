import { AgentAction } from '@domain/value-objects';
import { ActionType } from '../enums';
import type { WorkflowRunRecord, WorkflowStepRunRecord } from '@domain/entities/Workflow';
import type { IRunRepository } from './IRunRepository';
import type { ICheckpointRepository } from './ICheckpointRepository';
import type { IWorkflowRepository } from './IWorkflowRepository';

export interface AtomicWorkflowTransitionInput {
    readonly workflowRunId: string;
    readonly workflowRunUpdates: Pick<WorkflowRunRecord, 'status'> & Partial<Pick<WorkflowRunRecord, 'summary' | 'completedAt'>>;
    readonly workflowStepRunId: string;
    readonly workflowStepRunUpdates: Pick<WorkflowStepRunRecord, 'status'> & Partial<Pick<WorkflowStepRunRecord, 'summary' | 'completedAt' | 'runId'>>;
}

export interface Step {
    id: string;
    runId: string;
    stepNumber: number;
    actionType: ActionType;
    actionPayload: AgentAction;
    assets?: Record<string, string>;
    timestamp: string;
}

export interface CheckpointLineageInput {
    readonly checkpointId: string;
}

export interface IPersistenceAdapter extends IRunRepository, ICheckpointRepository, IWorkflowRepository {}
