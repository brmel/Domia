import { ResultAsync } from 'neverthrow';
import { PersistenceError } from '@domain/errors';
import { AgentAction } from '@domain/value-objects';
import { TestRun } from '@domain/entities/TestRun';
import type { RunCheckpointReason } from '@domain/value-objects/RunLifecycle';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';

// Removed local TestRun interface in favor of Domain Entity

import { ActionType } from '../enums/ActionType';
import type { WorkflowDefinition, WorkflowRunRecord, WorkflowStepRunRecord } from '@domain/entities/Workflow';

export interface AtomicWorkflowTransitionInput {
    readonly workflowRunId: string;
    readonly workflowRunUpdates: Pick<WorkflowRunRecord, 'status'> & Partial<Pick<WorkflowRunRecord, 'summary' | 'completedAt'>>;
    readonly workflowStepRunId: string;
    readonly workflowStepRunUpdates: Pick<WorkflowStepRunRecord, 'status'> & Partial<Pick<WorkflowStepRunRecord, 'summary' | 'completedAt' | 'testRunId'>>;
}

export interface TestStep {
    id: string;
    testRunId: string;
    stepNumber: number;
    actionType: ActionType;
    actionPayload: AgentAction;
    assets?: Record<string, string>;
    timestamp: string;
}

export interface LogEntry {
    testRunId: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    metadata?: unknown;
    timestamp: string;
}

export interface IPersistenceAdapter {
    saveTestRun(run: TestRun): ResultAsync<void, PersistenceError>;
    updateTestRun(id: string, updates: Partial<TestRun>): ResultAsync<void, PersistenceError>;
    saveTestStep(step: TestStep): ResultAsync<void, PersistenceError>;
    saveLog(log: LogEntry): ResultAsync<void, PersistenceError>;
    getTestRuns(limit?: number): ResultAsync<TestRun[], PersistenceError>;
    getTestRun(id: string): ResultAsync<TestRun | null, PersistenceError>;
    getTestSteps(runId: string): ResultAsync<TestStep[], PersistenceError>;
    clearHistory(): ResultAsync<void, PersistenceError>;

    // Durable Workflow
    saveCheckpoint(
        runId: string,
        state: import('@domain/value-objects/WorkflowState').WorkflowState,
        reason: RunCheckpointReason
    ): ResultAsync<void, PersistenceError>;
    getCheckpoint(runId: string): ResultAsync<import('@domain/value-objects/WorkflowState').WorkflowState | null, PersistenceError>;
    getCheckpointRecords(runId: string): ResultAsync<CheckpointRecord[], PersistenceError>;

    // Recovery Replay Idempotency
    saveReplayIdempotencyKey(runId: string, idempotencyKey: string): ResultAsync<void, PersistenceError>;
    hasReplayIdempotencyKey(runId: string, idempotencyKey: string): ResultAsync<boolean, PersistenceError>;

    // Workflow Definitions
    saveWorkflowDefinition(definition: WorkflowDefinition): ResultAsync<void, PersistenceError>;
    getWorkflowDefinition(id: string): ResultAsync<WorkflowDefinition | null, PersistenceError>;
    getWorkflowDefinitions(limit?: number): ResultAsync<WorkflowDefinition[], PersistenceError>;

    // Workflow Runs
    saveWorkflowRun(run: WorkflowRunRecord): ResultAsync<void, PersistenceError>;
    updateWorkflowRun(id: string, updates: Partial<WorkflowRunRecord>): ResultAsync<void, PersistenceError>;
    getWorkflowRun(id: string): ResultAsync<WorkflowRunRecord | null, PersistenceError>;
    getWorkflowRuns(limit?: number): ResultAsync<WorkflowRunRecord[], PersistenceError>;

    // Workflow Step Runs
    saveWorkflowStepRun(stepRun: WorkflowStepRunRecord): ResultAsync<void, PersistenceError>;
    updateWorkflowStepRun(id: string, updates: Partial<WorkflowStepRunRecord>): ResultAsync<void, PersistenceError>;
    getWorkflowStepRuns(workflowRunId: string): ResultAsync<WorkflowStepRunRecord[], PersistenceError>;

    // Workflow atomic transitions
    commitAtomicWorkflowTransition(input: AtomicWorkflowTransitionInput): ResultAsync<void, PersistenceError>;
}
