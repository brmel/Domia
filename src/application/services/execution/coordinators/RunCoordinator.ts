import { injectable } from 'tsyringe';
import type { RunInput } from '@application/dtos';
import type { PlatformSession } from '@application/services/platform/PlatformSession';
import type { RunOptions } from '@shared/validation';
import { resolveUrlFromConfig, resolveLaneKeyFromConfig } from '@application/services/platform/platformUrlUtils';

export interface StepExecutionOptions {
    vision: boolean;
    maxActions: number;
    maxElements: number;
}

@injectable()
export class RunCoordinator {
    resolveExecutionUrl(input: RunInput, runContext?: { session?: PlatformSession }): string {
        const sessionUrl = runContext?.session?.executionUrl;
        if (sessionUrl) {
            return sessionUrl;
        }

        return resolveUrlFromConfig(input.platformConfig);
    }

    resolveLaneKey(input: RunInput): string {
        return resolveLaneKeyFromConfig(input.platformConfig);
    }

    buildExecutionOptions(options?: RunOptions): StepExecutionOptions {
        return {
            vision: options?.vision ?? true,
            maxActions: options?.maxSteps ?? 20,
            maxElements: options?.maxElements ?? 50,
        };
    }
}
