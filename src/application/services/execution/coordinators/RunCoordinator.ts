import { injectable } from 'tsyringe';
import type { RunTestInput } from '@application/dtos';
import type { PlatformSession } from '@application/services/platform/PlatformSession';
import type { RunOptions } from '@shared/validation';

export interface StepExecutionOptions {
    vision: boolean;
    maxActions: number;
}

@injectable()
export class RunCoordinator {
    resolveExecutionUrl(input: RunTestInput, runContext?: { session?: PlatformSession }): string {
        const sessionUrl = runContext?.session?.executionUrl;
        if (sessionUrl) {
            return sessionUrl;
        }

        const platformConfig = input.platformConfig;
        if (platformConfig.platform === 'web') {
            return platformConfig.url;
        }

        if (platformConfig.connection.type === 'cdp') {
            return platformConfig.connection.cdpUrl;
        }

        return 'electron://app';
    }

    resolveLaneKey(input: RunTestInput): string {
        const platformConfig = input.platformConfig;

        if (platformConfig.platform === 'web') {
            return `platform:web:${platformConfig.url}`;
        }

        if (platformConfig.connection.type === 'cdp') {
            return `platform:electron:cdp:${platformConfig.connection.cdpUrl}`;
        }

        return `platform:electron:executable:${platformConfig.connection.executablePath}`;
    }

    buildExecutionOptions(options?: RunOptions): StepExecutionOptions {
        return {
            vision: options?.vision ?? true,
            maxActions: options?.maxSteps ?? 20,
        };
    }
}
