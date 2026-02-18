import { injectable, inject } from 'tsyringe';
import type { RunOptions } from '@shared/validation';
import type { IConfigService } from '@domain/ports';

export interface VerificationPolicyProfile {
    enforceSupervisedTerminalPass: boolean;
    terminalPassMinConfidence: number;
    terminalPassMinEvidenceItems: number;
}

export interface StepExecutionOptions {
    vision: boolean;
    debugScreenshots: boolean;
    maxActions: number;
    supervisedTerminalPass: boolean;
    verificationPolicyProfile: VerificationPolicyProfile;
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
    constructor(
        @inject('IConfigService') private readonly configService?: IConfigService,
    ) {}

    buildExecutionOptions(options?: RunOptions): StepExecutionOptions {
        const configVerification = this.configService?.get().verification;
        const runVerification = options?.verification;

        const verificationPolicyProfile: VerificationPolicyProfile = {
            enforceSupervisedTerminalPass:
                runVerification?.enforceSupervisedTerminalPass
                ?? options?.supervisedExecution
                ?? configVerification?.enforceSupervisedTerminalPass
                ?? true,
            terminalPassMinConfidence:
                runVerification?.terminalPassMinConfidence
                ?? configVerification?.terminalPassMinConfidence
                ?? 0.9,
            terminalPassMinEvidenceItems:
                runVerification?.terminalPassMinEvidenceItems
                ?? configVerification?.terminalPassMinEvidenceItems
                ?? 2,
        };

        return {
            vision: options?.vision ?? true,
            debugScreenshots: options?.debugScreenshots ?? false,
            maxActions: options?.maxSteps ?? 20,
            supervisedTerminalPass: verificationPolicyProfile.enforceSupervisedTerminalPass,
            verificationPolicyProfile,
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
