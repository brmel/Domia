import { ResultAsync } from 'neverthrow';
import { PersistenceError } from '@domain/errors';
import { Run } from '@domain/entities/Run';
import { AgentAction } from '@domain/value-objects';
import { ActionType } from '../enums';

export interface Step {
    id: string;
    runId: string;
    stepNumber: number;
    actionType: ActionType;
    actionPayload: AgentAction;
    assets?: Record<string, string>;
    timestamp: string;
}

export interface IRunRepository {
    saveRun(run: Run, platformConfigJson?: string): ResultAsync<void, PersistenceError>;
    getPlatformConfigJson(runId: string): ResultAsync<string | null, PersistenceError>;
    updateRun(id: string, updates: Partial<Run>): ResultAsync<void, PersistenceError>;
    getRun(id: string): ResultAsync<Run | null, PersistenceError>;
    getRuns(limit?: number): ResultAsync<Run[], PersistenceError>;
    saveStep(step: Step): ResultAsync<void, PersistenceError>;
    getStep(runId: string, stepNumber: number): ResultAsync<Step | null, PersistenceError>;
    getSteps(runId: string): ResultAsync<Step[], PersistenceError>;
    clearHistory(): ResultAsync<void, PersistenceError>;
}
