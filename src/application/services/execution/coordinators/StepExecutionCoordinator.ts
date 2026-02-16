import { injectable } from 'tsyringe';
import type { RunOptions } from '@shared/validation';

export interface StepExecutionOptions {
    vision: boolean;
    debugScreenshots: boolean;
    maxActions: number;
    supervisedTerminalPass: boolean;
    temporalObservation: boolean;
    temporalMode: 'adaptive' | 'baseline' | 'forensic' | 'off';
    temporalBurstFrames?: number;
    temporalBaselineIntervalMs?: number;
    temporalBurstIntervalMs?: number;
    temporalMaxFramesPerWindow?: number;
    temporalPromptTokenBudget?: number;
    temporalRedactSensitive?: boolean;
    temporalPersistWindow?: boolean;
}

@injectable()
export class StepExecutionCoordinator {
    buildExecutionOptions(options?: RunOptions): StepExecutionOptions {
        return {
            vision: options?.vision ?? true,
            debugScreenshots: options?.debugScreenshots ?? false,
            maxActions: options?.maxSteps ?? 20,
            supervisedTerminalPass: options?.supervisedExecution ?? false,
            temporalObservation: options?.temporalObservation ?? false,
            temporalMode: options?.temporalMode ?? 'adaptive',
            ...(options?.temporalBurstFrames !== undefined ? { temporalBurstFrames: options.temporalBurstFrames } : {}),
            ...(options?.temporalBaselineIntervalMs !== undefined ? { temporalBaselineIntervalMs: options.temporalBaselineIntervalMs } : {}),
            ...(options?.temporalBurstIntervalMs !== undefined ? { temporalBurstIntervalMs: options.temporalBurstIntervalMs } : {}),
            ...(options?.temporalMaxFramesPerWindow !== undefined ? { temporalMaxFramesPerWindow: options.temporalMaxFramesPerWindow } : {}),
            ...(options?.temporalPromptTokenBudget !== undefined ? { temporalPromptTokenBudget: options.temporalPromptTokenBudget } : {}),
            ...(options?.temporalRedactSensitive !== undefined ? { temporalRedactSensitive: options.temporalRedactSensitive } : {}),
            ...(options?.temporalPersistWindow !== undefined ? { temporalPersistWindow: options.temporalPersistWindow } : {})
        };
    }
}
