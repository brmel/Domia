import { TestRunId, Url } from '../value-objects';
import { TestStep } from './TestStep';

/**
 * TestRun Entity (Aggregate Root)
 * Represents a complete test execution
 */
export interface TestRun {
    readonly id: TestRunId;
    readonly url: Url;
    readonly prompt: string;
    readonly status: TestRunStatus;
    readonly steps: readonly TestStep[];
    readonly createdAt: Date;
    readonly updatedAt: Date;
}

export type TestRunStatus =
    | { type: 'pending' }
    | { type: 'running'; currentStep: number }
    | { type: 'passed'; summary: string; duration: number }
    | { type: 'failed'; error: string; failedAtStep: number; duration: number }
    | { type: 'cancelled'; reason: string };

export const TestRun = {
    create(params: { id: TestRunId; url: Url; prompt: string }): TestRun {
        return {
            id: params.id,
            url: params.url,
            prompt: params.prompt,
            status: { type: 'pending' },
            steps: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    },

    start(run: TestRun): TestRun {
        return {
            ...run,
            status: { type: 'running', currentStep: 0 },
            updatedAt: new Date(),
        };
    },

    addStep(run: TestRun, step: TestStep): TestRun {
        return {
            ...run,
            steps: [...run.steps, step],
            status: { type: 'running', currentStep: step.stepNumber },
            updatedAt: new Date(),
        };
    },

    updateStep(run: TestRun, stepNumber: number, updater: (step: TestStep) => TestStep): TestRun {
        return {
            ...run,
            steps: run.steps.map((s) => (s.stepNumber === stepNumber ? updater(s) : s)),
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

    fail(run: TestRun, error: string, failedAtStep: number): TestRun {
        const duration = Date.now() - run.createdAt.getTime();
        return {
            ...run,
            status: { type: 'failed', error, failedAtStep, duration },
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
