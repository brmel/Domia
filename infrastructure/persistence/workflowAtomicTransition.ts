import type { Database as SqlJsDatabase } from 'sql.js';
import type { AtomicWorkflowTransitionInput } from '@domain/ports/persistence/IWorkflowRepository';

/**
 * Hand-rolled BEGIN/COMMIT/ROLLBACK that updates a workflow_step_run and its workflow_run
 * in one transaction. Lives outside the repository because it bypasses Kysely (raw sql.js)
 * — keeping the repo's query methods uniform. Throws on failure (wrapped by dbOp at the call site).
 */
export function commitAtomicWorkflowTransition(database: SqlJsDatabase, input: AtomicWorkflowTransitionInput): void {
    database.run('BEGIN TRANSACTION');
    try {
        const stepSetClauses: string[] = ['status = ?'];
        const stepParams: (string | null)[] = [input.workflowStepRunUpdates.status];

        if (input.workflowStepRunUpdates.summary !== undefined) {
            stepSetClauses.push('summary = ?');
            stepParams.push(input.workflowStepRunUpdates.summary ?? null);
        }
        if (input.workflowStepRunUpdates.completedAt !== undefined) {
            stepSetClauses.push('completed_at = ?');
            stepParams.push(input.workflowStepRunUpdates.completedAt ?? null);
        }
        if (input.workflowStepRunUpdates.runId !== undefined) {
            stepSetClauses.push('run_id = ?');
            stepParams.push(input.workflowStepRunUpdates.runId ?? null);
        }
        stepParams.push(input.workflowStepRunId);

        database.run(`UPDATE workflow_step_runs SET ${stepSetClauses.join(', ')} WHERE id = ?`, stepParams);

        const runSetClauses: string[] = ['status = ?'];
        const runParams: (string | null)[] = [input.workflowRunUpdates.status];

        if (input.workflowRunUpdates.summary !== undefined) {
            runSetClauses.push('summary = ?');
            runParams.push(input.workflowRunUpdates.summary ?? null);
        }
        if (input.workflowRunUpdates.completedAt !== undefined) {
            runSetClauses.push('completed_at = ?');
            runParams.push(input.workflowRunUpdates.completedAt ?? null);
        }
        runParams.push(input.workflowRunId);

        database.run(`UPDATE workflow_runs SET ${runSetClauses.join(', ')} WHERE id = ?`, runParams);

        database.run('COMMIT');
    } catch (e) {
        database.run('ROLLBACK');
        throw e;
    }
}
