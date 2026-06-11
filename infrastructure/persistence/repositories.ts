import type { IRunRepository } from '@domain/ports/persistence/IRunRepository';
import type { ICheckpointRepository } from '@domain/ports/persistence/ICheckpointRepository';
import type { IWorkflowRepository } from '@domain/ports/persistence/IWorkflowRepository';
import type { ISkillRepository } from '@domain/ports/persistence/ISkillRepository';
import type { SqlJsConnection } from './SqlJsConnection';
import { persistAware } from './persistAware';

export const createRunRepository = (conn: SqlJsConnection): IRunRepository =>
    persistAware<IRunRepository>(conn, () => conn.runs(), {
        saveRun: 'write',
        getPlatformConfigJson: 'read',
        updateRun: 'write',
        getRun: 'read',
        getRuns: 'read',
        saveStep: 'write',
        getStep: 'read',
        getSteps: 'read',
        clearHistory: 'write',
    });

export const createCheckpointRepository = (conn: SqlJsConnection): ICheckpointRepository =>
    persistAware<ICheckpointRepository>(conn, () => conn.checkpoints(), {
        saveCheckpoint: 'write',
        getCheckpointRecords: 'read',
        pruneActionCheckpoints: 'write',
    });

export const createWorkflowRepository = (conn: SqlJsConnection): IWorkflowRepository =>
    persistAware<IWorkflowRepository>(conn, () => conn.workflows(), {
        saveWorkflowDefinition: 'write',
        getWorkflowDefinition: 'read',
        getWorkflowDefinitions: 'read',
        saveWorkflowRun: 'write',
        updateWorkflowRun: 'write',
        getWorkflowRun: 'read',
        getWorkflowRuns: 'read',
        saveWorkflowStepRun: 'write',
        updateWorkflowStepRun: 'write',
        getWorkflowStepRuns: 'read',
        commitAtomicWorkflowTransition: 'write',
    });

export const createSkillRepository = (conn: SqlJsConnection): ISkillRepository =>
    persistAware<ISkillRepository>(conn, () => conn.skills(), {
        save: 'write',
        list: 'read',
        get: 'read',
        delete: 'write',
    });
