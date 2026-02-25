import { RunId, Url } from '../value-objects';
import { Plan } from './Plan';

export interface TestRun {
    readonly id: RunId;
    readonly url: Url;
    readonly prompt: string;
    readonly status: RunStatus;
    readonly plan?: Plan;
    readonly createdAt: Date;
    readonly startedAt?: Date;
    readonly updatedAt: Date;
}

export type RunStatus =
    | { type: 'pending' }
    | { type: 'running' }
    | { type: 'passed'; summary: string; duration: number }
    | { type: 'failed'; error: string; duration: number }
    | { type: 'cancelled'; reason: string };

export const TestRun = {
    create(params: { id: RunId; url: Url; prompt: string }): TestRun {
        return {
            id: params.id,
            url: params.url,
            prompt: params.prompt,
            status: { type: 'pending' },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    },

    start(run: TestRun): TestRun {
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

    updatePlan(run: TestRun, plan: Plan): TestRun {
        return {
            ...run,
            plan,
            updatedAt: new Date(),
        };
    },

    pass(run: TestRun, summary: string): TestRun {
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

    fail(run: TestRun, error: string): TestRun {
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

    cancel(run: TestRun, reason: string): TestRun {
        if (run.status.type !== 'running' && run.status.type !== 'pending') {
            throw new Error(`Cannot cancel a run in '${run.status.type}' state`);
        }
        return {
            ...run,
            status: { type: 'cancelled', reason },
            updatedAt: new Date(),
        };
    },
};
