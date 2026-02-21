import { injectable } from 'tsyringe';
import type { RunOptions } from '@shared/validation';

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
}

@injectable()
export class StepExecutionCoordinator {
    constructor() {}

    buildExecutionOptions(options?: RunOptions): StepExecutionOptions {
        const runVerification = options?.verification;

        const verificationPolicyProfile: VerificationPolicyProfile = {
            enforceSupervisedTerminalPass:
                runVerification?.enforceSupervisedTerminalPass
                ?? options?.supervisedExecution
                ?? true,
            terminalPassMinConfidence:
                runVerification?.terminalPassMinConfidence
                ?? 0.9,
            terminalPassMinEvidenceItems:
                runVerification?.terminalPassMinEvidenceItems
                ?? 2,
        };

        return {
            vision: options?.vision ?? true,
            debugScreenshots: options?.debugScreenshots ?? false,
            maxActions: options?.maxSteps ?? 20,
            supervisedTerminalPass: verificationPolicyProfile.enforceSupervisedTerminalPass,
            verificationPolicyProfile,
        };
    }
}
