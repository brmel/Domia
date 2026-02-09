import { ResultAsync } from 'neverthrow';
import { PersistenceError } from '@domain/errors';
import { AgentAction } from '@domain/value-objects';

export interface TestRun {
    id: string;
    url: string;
    status: 'pass' | 'fail' | 'running';
    startedAt: string;
    completedAt?: string;
    durationMs?: number;
    goal?: string;
    summary?: string;
}

export interface TestStep {
    id: string;
    testRunId: string;
    stepNumber: number;
    actionType: string;
    actionPayload: AgentAction;
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
    saveCheckpoint(runId: string, state: import('@domain/value-objects/WorkflowState').WorkflowState): ResultAsync<void, PersistenceError>;
    getCheckpoint(runId: string): ResultAsync<import('@domain/value-objects/WorkflowState').WorkflowState | null, PersistenceError>;
}
