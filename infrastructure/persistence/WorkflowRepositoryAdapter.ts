import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import type { IWorkflowRepository } from '@domain/ports/IWorkflowRepository';
import type { AtomicWorkflowTransitionInput } from '@domain/ports/IPersistenceAdapter';
import type { WorkflowDefinition, WorkflowRunRecord, WorkflowStepRunRecord } from '@domain/entities/Workflow';
import { PersistenceError } from '@domain/errors';
import { SqlJsConnection } from './SqlJsConnection';

/** Persist-aware IWorkflowRepository bound to the 'IWorkflowRepository' token. */
@injectable()
export class WorkflowRepositoryAdapter implements IWorkflowRepository {
    constructor(@inject(SqlJsConnection) private readonly conn: SqlJsConnection) {}

    saveWorkflowDefinition(definition: WorkflowDefinition): ResultAsync<void, PersistenceError> {
        return this.conn.withPersist(() => this.conn.workflows().saveWorkflowDefinition(definition));
    }
    getWorkflowDefinition(id: string): ResultAsync<WorkflowDefinition | null, PersistenceError> {
        return this.conn.withReady(() => this.conn.workflows().getWorkflowDefinition(id));
    }
    getWorkflowDefinitions(limit?: number): ResultAsync<WorkflowDefinition[], PersistenceError> {
        return this.conn.withReady(() => this.conn.workflows().getWorkflowDefinitions(limit));
    }
    saveWorkflowRun(run: WorkflowRunRecord): ResultAsync<void, PersistenceError> {
        return this.conn.withPersist(() => this.conn.workflows().saveWorkflowRun(run));
    }
    updateWorkflowRun(id: string, updates: Partial<WorkflowRunRecord>): ResultAsync<void, PersistenceError> {
        return this.conn.withPersist(() => this.conn.workflows().updateWorkflowRun(id, updates));
    }
    getWorkflowRun(id: string): ResultAsync<WorkflowRunRecord | null, PersistenceError> {
        return this.conn.withReady(() => this.conn.workflows().getWorkflowRun(id));
    }
    getWorkflowRuns(limit?: number): ResultAsync<WorkflowRunRecord[], PersistenceError> {
        return this.conn.withReady(() => this.conn.workflows().getWorkflowRuns(limit));
    }
    saveWorkflowStepRun(stepRun: WorkflowStepRunRecord): ResultAsync<void, PersistenceError> {
        return this.conn.withPersist(() => this.conn.workflows().saveWorkflowStepRun(stepRun));
    }
    updateWorkflowStepRun(id: string, updates: Partial<WorkflowStepRunRecord>): ResultAsync<void, PersistenceError> {
        return this.conn.withPersist(() => this.conn.workflows().updateWorkflowStepRun(id, updates));
    }
    getWorkflowStepRuns(workflowRunId: string): ResultAsync<WorkflowStepRunRecord[], PersistenceError> {
        return this.conn.withReady(() => this.conn.workflows().getWorkflowStepRuns(workflowRunId));
    }
    commitAtomicWorkflowTransition(input: AtomicWorkflowTransitionInput): ResultAsync<void, PersistenceError> {
        return this.conn.withPersist(() => this.conn.workflows().commitAtomicWorkflowTransition(input));
    }
}
