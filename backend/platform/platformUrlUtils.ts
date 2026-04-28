import type { PlatformConfig, PlatformType } from '@domain/types/PlatformConfig';
import type { RunOptions } from '@shared/contracts/run';
import { normalizeWebUrl } from '@shared/contracts/platform';
import { DEFAULT_MAX_ACTIONS } from '@shared/defaults';
import { ArtifactRetention, DEFAULT_ARTIFACT_RETENTION } from '@domain/value-objects/ArtifactRetention';

export interface StepExecutionOptions {
    vision: boolean;
    maxActions: number;
    platform?: PlatformType | undefined;
    recording?: {
        enabled: boolean;
        maxDurationMs?: number;
        intervalMs?: number;
    };
    persistArtifacts: ArtifactRetention;
    extras?: Readonly<Record<string, unknown>>;
}

export function resolveUrlFromConfig(config: PlatformConfig): string {
    switch (config.platform) {
        case 'web':
            return normalizeWebUrl(config.url);
        case 'electron':
            if (config.startUrl) return config.startUrl;
            return config.connection.type === 'cdp'
                ? config.connection.cdpUrl
                : 'electron://app';
        case 'mobile':
            return config.capabilities.os === 'ios'
                ? `mobile:ios:${config.capabilities.bundleId}`
                : `mobile:android:${config.capabilities.appPackage}`;
    }
}

export function resolveLaneKeyFromConfig(config: PlatformConfig): string {
    switch (config.platform) {
        case 'web':
            return `platform:web:${config.url}`;
        case 'electron':
            return config.connection.type === 'cdp'
                ? `platform:electron:cdp:${config.connection.cdpUrl}`
                : `platform:electron:executable:${config.connection.executablePath}`;
        case 'mobile':
            return `platform:mobile:${config.appiumServerUrl}:${config.capabilities.os}`;
    }
}

export function buildExecutionOptions(options?: RunOptions, platform?: PlatformType): StepExecutionOptions {
    const base: StepExecutionOptions = {
        vision: options?.vision ?? true,
        maxActions: options?.maxSteps ?? DEFAULT_MAX_ACTIONS,
        platform,
        persistArtifacts: (options?.persistArtifacts as ArtifactRetention | undefined) ?? DEFAULT_ARTIFACT_RETENTION,
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
