import { Generated } from 'kysely';

export interface RunTable {
    id: string;
    url: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    duration_ms: number | null;
    goal: string | null;
    summary: string | null;
}

export interface StepTable {
    id: string;
    run_id: string;
    step_number: number;
    action_type: string;
    action_payload: string;
    assets_json: string | null;
    timestamp: string;
}

export interface LogTable {
    id: Generated<number>;
    run_id: string;
    level: string;
    message: string;
    metadata: string | null;
    timestamp: string;
}

export interface WorkflowCheckpointTable {
    id: Generated<number>;
    run_id: string;
    checkpoint_id: string;
    parent_checkpoint_id: string | null;
    branch_id: string;
    sequence_number: number;
    commit_boundary: number;
    side_effect_set_hash: string | null;
    state_json: string;
    reason: string;
    created_at: string;
}

export interface ReplayIdempotencyKeyTable {
    id: Generated<number>;
    run_id: string;
    idempotency_key: string;
    created_at: string;
}

export interface SchemaMigrationTable {
    id: string;
    applied_at: string;
}

export interface WorkflowDefinitionTable {
    id: string;
    name: string;
    description: string | null;
    status: string;
    version: number;
    platform_config_json: string;
    steps_json: string;
    created_at: string;
    updated_at: string;
}

export interface WorkflowRunTable {
    id: string;
    workflow_definition_id: string;
    workflow_version: number;
    status: string;
    summary: string | null;
    started_at: string;
    completed_at: string | null;
}

export interface WorkflowStepRunTable {
    id: string;
    workflow_run_id: string;
    step_id: string;
    step_index: number;
    run_id: string | null;
    status: string;
    summary: string | null;
    started_at: string;
    completed_at: string | null;
}

export interface DatabaseSchema {
    runs: RunTable;
    steps: StepTable;
    logs: LogTable;
    workflow_checkpoints: WorkflowCheckpointTable;
    replay_idempotency_keys: ReplayIdempotencyKeyTable;
    schema_migrations: SchemaMigrationTable;
    workflow_definitions: WorkflowDefinitionTable;
    workflow_runs: WorkflowRunTable;
    workflow_step_runs: WorkflowStepRunTable;
}
