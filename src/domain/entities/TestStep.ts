import { AgentAction, ArtifactPath } from '../value-objects';
import { nanoid } from 'nanoid';

/**
 * TestStep Entity
 * Represents a single step in a test run
 */
export interface TestStep {
    readonly id: string;
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

export const TestStepFactory = {
    create(params: {
        stepNumber: number;
        action: AgentAction;
    }): TestStep {
        return {
            id: nanoid(),
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
