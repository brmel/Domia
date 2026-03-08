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

export interface WorkflowCheckpointTable {
    id: Generated<number>;
    run_id: string;
    checkpoint_id: string;
    state_json: string;
    reason: string;
    created_at: string;
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
    workflow_checkpoints: WorkflowCheckpointTable;
    workflow_definitions: WorkflowDefinitionTable;
    workflow_runs: WorkflowRunTable;
    workflow_step_runs: WorkflowStepRunTable;
}
