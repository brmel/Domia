import { TestRunId, Url } from '../value-objects';
import { Plan } from './Plan';

/**
 * TestRun Entity (Aggregate Root)
 * Represents a complete test execution
 */
export interface TestRun {
    readonly id: TestRunId;
    readonly url: Url;
    readonly prompt: string;
    readonly status: TestRunStatus;
    readonly plan?: Plan;
    readonly createdAt: Date;
    readonly startedAt?: Date;
    readonly updatedAt: Date;
}

export type TestRunStatus =
    | { type: 'pending' }
    | { type: 'running' }
    | { type: 'passed'; summary: string; duration: number }
    | { type: 'failed'; error: string; duration: number }
    | { type: 'cancelled'; reason: string };

export const TestRun = {
    create(params: { id: TestRunId; url: Url; prompt: string }): TestRun {
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
        const duration = Date.now() - run.createdAt.getTime();
        return {
            ...run,
            status: { type: 'passed', summary, duration },
            updatedAt: new Date(),
        };
    },

    fail(run: TestRun, error: string): TestRun {
        const duration = Date.now() - run.createdAt.getTime();
        return {
            ...run,
            status: { type: 'failed', error, duration },
            updatedAt: new Date(),
        };
    },

    cancel(run: TestRun, reason: string): TestRun {
        return {
            ...run,
            status: { type: 'cancelled', reason },
            updatedAt: new Date(),
        };
    },
};
