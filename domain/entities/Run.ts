import { RunId, Url } from '../value-objects';
import { Plan } from './Plan';

export interface Run {
    readonly id: RunId;
    readonly url: Url;
    readonly prompt: string;
    readonly status: RunStatus;
    readonly plan?: Plan;
    readonly parentRunId?: RunId;
    readonly createdAt: Date;
    readonly startedAt?: Date;
    readonly updatedAt: Date;
}

export type RunStatus =
    | { type: 'pending' }
    | { type: 'running' }
    | { type: 'suspended'; reason: string }
    | { type: 'passed'; summary: string; duration: number }
    | { type: 'finished'; summary: string; value?: unknown; duration: number }
    | { type: 'failed'; error: string; duration: number }
    | { type: 'cancelled'; reason: string };

export const Run = {
    create(params: { id: RunId; url: Url; prompt: string; parentRunId?: RunId }): Run {
        return {
            id: params.id,
            url: params.url,
            prompt: params.prompt,
            status: { type: 'pending' },
            ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    },

    start(run: Run): Run {
        if (run.status.type !== 'pending') {
            throw new Error(`Cannot start a run in '${run.status.type}' state`);
        }
        return {
            ...run,
            status: { type: 'running' },
            startedAt: new Date(),
            updatedAt: new Date(),
        };
    },

    pass(run: Run, summary: string): Run {
        if (run.status.type !== 'running') {
            throw new Error(`Cannot pass a run in '${run.status.type}' state`);
        }
        const duration = Date.now() - run.createdAt.getTime();
        return {
            ...run,
            status: { type: 'passed', summary, duration },
            updatedAt: new Date(),
        };
    },

    fail(run: Run, error: string): Run {
        if (run.status.type !== 'running' && run.status.type !== 'pending') {
            throw new Error(`Cannot fail a run in '${run.status.type}' state`);
        }
        const duration = Date.now() - run.createdAt.getTime();
        return {
            ...run,
            status: { type: 'failed', error, duration },
            updatedAt: new Date(),
        };
    },

    finish(run: Run, summary: string, value?: unknown): Run {
        if (run.status.type !== 'running') {
            throw new Error(`Cannot finish a run in '${run.status.type}' state`);
        }
        const duration = Date.now() - run.createdAt.getTime();
        return {
            ...run,
            status: { type: 'finished', summary, ...(value !== undefined ? { value } : {}), duration },
            updatedAt: new Date(),
        };
    },

    suspend(run: Run, reason: string): Run {
        if (run.status.type !== 'running') {
            throw new Error(`Cannot suspend a run in '${run.status.type}' state`);
        }
        return {
            ...run,
            status: { type: 'suspended', reason },
            updatedAt: new Date(),
        };
    },

    resume(run: Run): Run {
        if (run.status.type !== 'suspended') {
            throw new Error(`Cannot resume a run in '${run.status.type}' state`);
        }
        return {
            ...run,
            status: { type: 'running' },
            updatedAt: new Date(),
        };
    },
};
