import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import type { IRunRepository } from '@domain/ports/persistence/IRunRepository';
import type { Step } from '@domain/ports';
import { Run } from '@domain/entities/Run';
import { PersistenceError } from '@domain/errors';
import { SqlJsConnection } from './SqlJsConnection';

/** Persist-aware IRunRepository bound to the 'IRunRepository' token. */
@injectable()
export class RunRepositoryAdapter implements IRunRepository {
    constructor(@inject(SqlJsConnection) private readonly conn: SqlJsConnection) {}

    saveRun(run: Run, platformConfigJson?: string): ResultAsync<void, PersistenceError> {
        return this.conn.withPersist(() => this.conn.runs().saveRun(run, platformConfigJson));
    }
    getPlatformConfigJson(runId: string): ResultAsync<string | null, PersistenceError> {
        return this.conn.withReady(() => this.conn.runs().getPlatformConfigJson(runId));
    }
    updateRun(id: string, updates: Partial<Run>): ResultAsync<void, PersistenceError> {
        return this.conn.withPersist(() => this.conn.runs().updateRun(id, updates));
    }
    getRun(id: string): ResultAsync<Run | null, PersistenceError> {
        return this.conn.withReady(() => this.conn.runs().getRun(id));
    }
    getRuns(limit?: number): ResultAsync<Run[], PersistenceError> {
        return this.conn.withReady(() => this.conn.runs().getRuns(limit));
    }
    saveStep(step: Step): ResultAsync<void, PersistenceError> {
        return this.conn.withPersist(() => this.conn.runs().saveStep(step));
    }
    getStep(runId: string, stepNumber: number): ResultAsync<Step | null, PersistenceError> {
        return this.conn.withReady(() => this.conn.runs().getStep(runId, stepNumber));
    }
    getSteps(runId: string): ResultAsync<Step[], PersistenceError> {
        return this.conn.withReady(() => this.conn.runs().getSteps(runId));
    }
    clearHistory(): ResultAsync<void, PersistenceError> {
        return this.conn.withPersist(() => this.conn.runs().clearHistory());
    }
}
