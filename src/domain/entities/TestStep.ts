import { AgentAction, ArtifactPath } from '../value-objects';

/**
 * TestStep Entity
 * Represents a single step in a test run
 */
export interface TestStep {
    readonly stepNumber: number;
    readonly action: AgentAction;
    readonly status: StepStatus;
    readonly screenshot: ArtifactPath | null;
    readonly timestamp: Date;
    readonly duration: number;
}

export type StepStatus =
    | { type: 'pending' }
    | { type: 'executing' }
    | { type: 'success' }
    | { type: 'failed'; error: string };

export const TestStep = {
    create(params: {
        stepNumber: number;
        action: AgentAction;
    }): TestStep {
        return {
            stepNumber: params.stepNumber,
            action: params.action,
            status: { type: 'pending' },
            screenshot: null,
            timestamp: new Date(),
            duration: 0,
        };
    },

    markExecuting(step: TestStep): TestStep {
        return { ...step, status: { type: 'executing' } };
    },

    markSuccess(step: TestStep, screenshot: ArtifactPath | null, duration: number): TestStep {
        return {
            ...step,
            status: { type: 'success' },
            screenshot,
            duration,
        };
    },

    markFailed(step: TestStep, error: string, duration: number): TestStep {
        return {
            ...step,
            status: { type: 'failed', error },
            duration,
        };
    },
};
