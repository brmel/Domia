import { WorkflowStepKind } from '@domain/value-objects/WorkflowStepKind';
import type { WorkflowDefinition, WorkflowRunRecord, WorkflowStepRunRecord } from '@domain/entities/Workflow';
import type { WorkflowDefinitionTable, WorkflowRunTable, WorkflowStepRunTable } from './DatabaseSchema';
import { unpackBlob } from './blob';
import { PlatformConfigSchema } from '@shared/contracts/run';

/** Pure row -> domain mappers for the workflow aggregate (no DB access). */

export function rowToWorkflowDefinition(row: WorkflowDefinitionTable): WorkflowDefinition {
    const rawSteps = unpackBlob<Array<Record<string, unknown>>>(row.steps_json);
    return {
        id: row.id,
        name: row.name,
        ...(row.description ? { description: row.description } : {}),
        status: row.status as WorkflowDefinition['status'],
        version: row.version,
        platformConfig: PlatformConfigSchema.parse(unpackBlob(row.platform_config_json)) as WorkflowDefinition['platformConfig'],
        steps: rawSteps.map((s) => (s['kind'] === WorkflowStepKind.ForEach ? s : { kind: WorkflowStepKind.Agent, ...s })) as unknown as WorkflowDefinition['steps'],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function rowToWorkflowRun(row: WorkflowRunTable): WorkflowRunRecord {
    return {
        id: row.id,
        workflowDefinitionId: row.workflow_definition_id,
        workflowVersion: row.workflow_version,
        status: row.status as WorkflowRunRecord['status'],
        ...(row.summary ? { summary: row.summary } : {}),
        startedAt: row.started_at,
        ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    };
}

export function rowToWorkflowStepRun(row: WorkflowStepRunTable): WorkflowStepRunRecord {
    return {
        id: row.id,
        workflowRunId: row.workflow_run_id,
        stepId: row.step_id,
        stepIndex: row.step_index,
        ...(row.run_id ? { runId: row.run_id } : {}),
        status: row.status as WorkflowStepRunRecord['status'],
        ...(row.summary ? { summary: row.summary } : {}),
        startedAt: row.started_at,
        ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    };
}
