import { injectable } from 'tsyringe';
import type { RunInput } from '@application/dtos';
import type { PlatformSession } from '@application/services/platform/PlatformSession';
import type { RunOptions } from '@shared/validation';
import { resolveUrlFromConfig, resolveLaneKeyFromConfig } from '@application/services/platform/platformUrlUtils';

import type { PlatformType } from '@domain/types/PlatformConfig';

export interface StepExecutionOptions {
    vision: boolean;
    maxActions: number;
    platform?: PlatformType | undefined;
    recording?: {
        enabled: boolean;
        maxDurationMs?: number;
        intervalMs?: number;
    };
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

    buildExecutionOptions(options?: RunOptions, platform?: PlatformType): StepExecutionOptions {
        const base: StepExecutionOptions = {
            vision: options?.vision ?? true,
            maxActions: options?.maxSteps ?? 20,
            platform,
        };
        if (options?.recording) {
            const rec: StepExecutionOptions['recording'] = { enabled: true };
            if (options.recordingMaxDurationMs !== undefined) {
                (rec as { maxDurationMs: number }).maxDurationMs = options.recordingMaxDurationMs;
            }
            if (options.recordingIntervalMs !== undefined) {
                (rec as { intervalMs: number }).intervalMs = options.recordingIntervalMs;
            }
            return { ...base, recording: rec };
        }
        return base;
    }
}
