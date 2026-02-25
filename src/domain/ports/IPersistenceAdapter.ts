import { ResultAsync } from 'neverthrow';
import { PersistenceError } from '@domain/errors';
import { AgentAction } from '@domain/value-objects';
import { Run } from '@domain/entities/Run';
import type { RunCheckpointReason } from '@domain/value-objects/RunLifecycle';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';

import { ActionType } from '../enums/ActionType';
import type { WorkflowDefinition, WorkflowRunRecord, WorkflowStepRunRecord } from '@domain/entities/Workflow';

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

export interface LogEntry {
    runId: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    metadata?: unknown;
    timestamp: string;
}

export interface CheckpointLineageInput {
    readonly checkpointId: string;
    readonly parentCheckpointId: string | null;
    readonly branchId: string;
    readonly sequenceNumber: number;
    readonly commitBoundary: boolean;
    readonly sideEffectSetHash: string | null;
}

export interface IPersistenceAdapter {
    saveRun(run: Run): ResultAsync<void, PersistenceError>;
    updateRun(id: string, updates: Partial<Run>): ResultAsync<void, PersistenceError>;
    saveStep(step: Step): ResultAsync<void, PersistenceError>;
    saveLog(log: LogEntry): ResultAsync<void, PersistenceError>;
    getRuns(limit?: number): ResultAsync<Run[], PersistenceError>;
    getRun(id: string): ResultAsync<Run | null, PersistenceError>;
    getSteps(runId: string): ResultAsync<Step[], PersistenceError>;
    clearHistory(): ResultAsync<void, PersistenceError>;

    saveCheckpoint(
        runId: string,
        state: import('@domain/value-objects/WorkflowState').WorkflowState,
        reason: RunCheckpointReason,
        lineage: CheckpointLineageInput
    ): ResultAsync<void, PersistenceError>;
    getCheckpoint(runId: string): ResultAsync<import('@domain/value-objects/WorkflowState').WorkflowState | null, PersistenceError>;
    getCheckpointRecords(runId: string): ResultAsync<CheckpointRecord[], PersistenceError>;

    saveReplayIdempotencyKey(runId: string, idempotencyKey: string): ResultAsync<void, PersistenceError>;
    hasReplayIdempotencyKey(runId: string, idempotencyKey: string): ResultAsync<boolean, PersistenceError>;

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
