import { injectable } from 'tsyringe';
import type { RunOptions } from '@shared/validation';

export interface StepExecutionOptions {
    vision: boolean;
    maxActions: number;
}

@injectable()
export class StepExecutionCoordinator {
    constructor() {}

    buildExecutionOptions(options?: RunOptions): StepExecutionOptions {
        return {
            vision: options?.vision ?? true,
            maxActions: options?.maxSteps ?? 20,
        };
    }
}
