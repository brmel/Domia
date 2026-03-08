import type { PlatformConfig, PlatformType } from '@domain/types/PlatformConfig';
import type { RunOptions } from '@shared/validation';
import { DEFAULT_MAX_ACTIONS } from '@shared/defaults';

export interface StepExecutionOptions {
    vision: boolean;
    maxActions: number;
    platform?: PlatformType | undefined;
    recording?: {
        enabled: boolean;
        maxDurationMs?: number;
        intervalMs?: number;
    };
    extras?: Readonly<Record<string, unknown>>;
}

export function resolveUrlFromConfig(config: PlatformConfig): string {
    switch (config.platform) {
        case 'web':
            return config.url;
        case 'electron':
            if (config.startUrl) return config.startUrl;
            return config.connection.type === 'cdp'
                ? config.connection.cdpUrl
                : 'electron://app';
        case 'android':
            return `android://${config.appPackage}`;
        case 'ios':
            return `ios://${config.bundleId}`;
    }
}

/**
 * Build a unique lane-key for concurrency control from a PlatformConfig.
 */
export function resolveLaneKeyFromConfig(config: PlatformConfig): string {
    switch (config.platform) {
        case 'web':
            return `platform:web:${config.url}`;
        case 'electron':
            return config.connection.type === 'cdp'
                ? `platform:electron:cdp:${config.connection.cdpUrl}`
                : `platform:electron:executable:${config.connection.executablePath}`;
        case 'android':
            return `platform:android:${config.appPackage}`;
        case 'ios':
            return `platform:ios:${config.bundleId}`;
    }
}

export function buildExecutionOptions(options?: RunOptions, platform?: PlatformType): StepExecutionOptions {
    const base: StepExecutionOptions = {
        vision: options?.vision ?? true,
        maxActions: options?.maxSteps ?? DEFAULT_MAX_ACTIONS,
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
