import { ResultAsync } from 'neverthrow';
import { PersistenceError } from '@domain/errors';
import type { WorkflowDefinition, WorkflowRunRecord, WorkflowStepRunRecord } from '@domain/entities/Workflow';

export interface AtomicWorkflowTransitionInput {
    readonly workflowRunId: string;
    readonly workflowRunUpdates: Pick<WorkflowRunRecord, 'status'> & Partial<Pick<WorkflowRunRecord, 'summary' | 'completedAt'>>;
    readonly workflowStepRunId: string;
    readonly workflowStepRunUpdates: Pick<WorkflowStepRunRecord, 'status'> & Partial<Pick<WorkflowStepRunRecord, 'summary' | 'completedAt' | 'runId'>>;
}

export interface IWorkflowRepository {
    saveWorkflowDefinition(definition: WorkflowDefinition): ResultAsync<void, PersistenceError>;
    getWorkflowDefinition(id: string): ResultAsync<WorkflowDefinition | null, PersistenceError>;
    getWorkflowDefinitions(limit?: number): ResultAsync<WorkflowDefinition[], PersistenceError>;
    saveWorkflowRun(run: WorkflowRunRecord): ResultAsync<void, PersistenceError>;
    updateWorkflowRun(id: string, updates: Partial<WorkflowRunRecord>): ResultAsync<void, PersistenceError>;
    getWorkflowRun(id: string): ResultAsync<WorkflowRunRecord | null, PersistenceError>;
    getWorkflowRuns(limit?: number): ResultAsync<WorkflowRunRecord[], PersistenceError>;
    saveWorkflowStepRun(stepRun: WorkflowStepRunRecord): ResultAsync<void, PersistenceError>;
    updateWorkflowStepRun(id: string, updates: Partial<WorkflowStepRunRecord>): ResultAsync<void, PersistenceError>;
    getWorkflowStepRuns(workflowRunId: string): ResultAsync<WorkflowStepRunRecord[], PersistenceError>;
    commitAtomicWorkflowTransition(input: AtomicWorkflowTransitionInput): ResultAsync<void, PersistenceError>;
}
