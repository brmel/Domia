import { injectable } from 'tsyringe';
import type { RunInput } from '@application/dtos';
import type { PlatformSession } from '@application/services/platform/PlatformSession';
import type { RunOptions } from '@shared/validation';

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

        const platformConfig = input.platformConfig;
        if (platformConfig.platform === 'web') {
            return platformConfig.url;
        }

        if (platformConfig.platform === 'electron') {
            if (platformConfig.connection.type === 'cdp') {
                return platformConfig.connection.cdpUrl;
            }
            return 'electron://app';
        }

        if (platformConfig.platform === 'android') {
            return `android://${(platformConfig as import('@domain/types/PlatformConfig').AndroidPlatformConfig).appPackage}`;
        }

        if (platformConfig.platform === 'ios') {
            return `ios://${(platformConfig as import('@domain/types/PlatformConfig').IosPlatformConfig).bundleId}`;
        }

        // Exhaustive — all PlatformConfig variants handled above
        return (platformConfig as { platform: string }).platform + '://app';
    }

    resolveLaneKey(input: RunInput): string {
        const platformConfig = input.platformConfig;

        if (platformConfig.platform === 'web') {
            return `platform:web:${platformConfig.url}`;
        }

        if (platformConfig.platform === 'electron') {
            if (platformConfig.connection.type === 'cdp') {
                return `platform:electron:cdp:${platformConfig.connection.cdpUrl}`;
            }
            return `platform:electron:executable:${platformConfig.connection.executablePath}`;
        }

        if (platformConfig.platform === 'android') {
            return `platform:android:${(platformConfig as import('@domain/types/PlatformConfig').AndroidPlatformConfig).appPackage}`;
        }

        if (platformConfig.platform === 'ios') {
            return `platform:ios:${(platformConfig as import('@domain/types/PlatformConfig').IosPlatformConfig).bundleId}`;
        }

        // Exhaustive — all PlatformConfig variants handled above
        return `platform:${(platformConfig as { platform: string }).platform}:unknown`;
    }

    buildExecutionOptions(options?: RunOptions): StepExecutionOptions {
        return {
            vision: options?.vision ?? true,
            maxActions: options?.maxSteps ?? 20,
            maxElements: options?.maxElements ?? 50,
        };
    }
}
