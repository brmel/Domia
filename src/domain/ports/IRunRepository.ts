import { ResultAsync } from 'neverthrow';
import { PersistenceError } from '@domain/errors';
import { Run } from '@domain/entities/Run';
import type { Step } from './IPersistenceAdapter';

export interface IRunRepository {
    saveRun(run: Run): ResultAsync<void, PersistenceError>;
    updateRun(id: string, updates: Partial<Run>): ResultAsync<void, PersistenceError>;
    getRun(id: string): ResultAsync<Run | null, PersistenceError>;
    getRuns(limit?: number): ResultAsync<Run[], PersistenceError>;
    saveStep(step: Step): ResultAsync<void, PersistenceError>;
    getStep(runId: string, stepNumber: number): ResultAsync<Step | null, PersistenceError>;
    getSteps(runId: string): ResultAsync<Step[], PersistenceError>;
    clearHistory(): ResultAsync<void, PersistenceError>;
}
