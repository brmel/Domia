import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { IPersistenceAdapter, Step } from '@domain/ports';
import type { IRunRepository } from '@domain/ports/persistence/IRunRepository';
import type { ICheckpointRepository } from '@domain/ports/persistence/ICheckpointRepository';
import type { IWorkflowRepository } from '@domain/ports/persistence/IWorkflowRepository';
import { Run } from '@domain/entities/Run';
import type { WorkflowDefinition, WorkflowRunRecord, WorkflowStepRunRecord } from '@domain/entities/Workflow';
import type { AtomicWorkflowTransitionInput } from '@domain/ports/persistence/IWorkflowRepository';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';
import type { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import type { CheckpointMetadata } from '@domain/value-objects/CheckpointMetadata';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';
import { PersistenceError } from '@domain/errors';

/**
 * Composite IPersistenceAdapter for app-layer entry points (CLI commands, IPC
 * routers, ReportWriterService) that need the cross-aggregate union view. Pure
 * delegation to the per-aggregate adapters bound to the narrow ports — it holds
 * no connection or DB logic of its own. Backend services inject the narrow ports
 * directly (real ISP); this exists only for the few consumers that span aggregates.
 */
@injectable()
export class SQLiteAdapter implements IPersistenceAdapter {
    constructor(
        @inject('IRunRepository') private readonly runs: IRunRepository,
        @inject('ICheckpointRepository') private readonly checkpoints: ICheckpointRepository,
        @inject('IWorkflowRepository') private readonly workflows: IWorkflowRepository,
    ) {}

    // IRunRepository
    saveRun(run: Run, platformConfigJson?: string): ResultAsync<void, PersistenceError> { return this.runs.saveRun(run, platformConfigJson); }
    getPlatformConfigJson(runId: string): ResultAsync<string | null, PersistenceError> { return this.runs.getPlatformConfigJson(runId); }
    updateRun(id: string, updates: Partial<Run>): ResultAsync<void, PersistenceError> { return this.runs.updateRun(id, updates); }
    getRun(id: string): ResultAsync<Run | null, PersistenceError> { return this.runs.getRun(id); }
    getRuns(limit?: number): ResultAsync<Run[], PersistenceError> { return this.runs.getRuns(limit); }
    saveStep(step: Step): ResultAsync<void, PersistenceError> { return this.runs.saveStep(step); }
    getStep(runId: string, stepNumber: number): ResultAsync<Step | null, PersistenceError> { return this.runs.getStep(runId, stepNumber); }
    getSteps(runId: string): ResultAsync<Step[], PersistenceError> { return this.runs.getSteps(runId); }
    clearHistory(): ResultAsync<void, PersistenceError> { return this.runs.clearHistory(); }

    // ICheckpointRepository
    saveCheckpoint(runId: string, state: WorkflowState, reason: CheckpointReason, metadata?: CheckpointMetadata): ResultAsync<void, PersistenceError> {
        return this.checkpoints.saveCheckpoint(runId, state, reason, metadata);
    }
    getCheckpointRecords(runId: string): ResultAsync<CheckpointRecord[], PersistenceError> { return this.checkpoints.getCheckpointRecords(runId); }
    pruneActionCheckpoints(runId: string, keep: number): ResultAsync<void, PersistenceError> { return this.checkpoints.pruneActionCheckpoints(runId, keep); }

    // IWorkflowRepository
    saveWorkflowDefinition(definition: WorkflowDefinition): ResultAsync<void, PersistenceError> { return this.workflows.saveWorkflowDefinition(definition); }
    getWorkflowDefinition(id: string): ResultAsync<WorkflowDefinition | null, PersistenceError> { return this.workflows.getWorkflowDefinition(id); }
    getWorkflowDefinitions(limit?: number): ResultAsync<WorkflowDefinition[], PersistenceError> { return this.workflows.getWorkflowDefinitions(limit); }
    saveWorkflowRun(run: WorkflowRunRecord): ResultAsync<void, PersistenceError> { return this.workflows.saveWorkflowRun(run); }
    updateWorkflowRun(id: string, updates: Partial<WorkflowRunRecord>): ResultAsync<void, PersistenceError> { return this.workflows.updateWorkflowRun(id, updates); }
    getWorkflowRun(id: string): ResultAsync<WorkflowRunRecord | null, PersistenceError> { return this.workflows.getWorkflowRun(id); }
    getWorkflowRuns(limit?: number): ResultAsync<WorkflowRunRecord[], PersistenceError> { return this.workflows.getWorkflowRuns(limit); }
    saveWorkflowStepRun(stepRun: WorkflowStepRunRecord): ResultAsync<void, PersistenceError> { return this.workflows.saveWorkflowStepRun(stepRun); }
    updateWorkflowStepRun(id: string, updates: Partial<WorkflowStepRunRecord>): ResultAsync<void, PersistenceError> { return this.workflows.updateWorkflowStepRun(id, updates); }
    getWorkflowStepRuns(workflowRunId: string): ResultAsync<WorkflowStepRunRecord[], PersistenceError> { return this.workflows.getWorkflowStepRuns(workflowRunId); }
    commitAtomicWorkflowTransition(input: AtomicWorkflowTransitionInput): ResultAsync<void, PersistenceError> { return this.workflows.commitAtomicWorkflowTransition(input); }
}
