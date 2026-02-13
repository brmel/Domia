
import { AgentAction, TestRunId } from '../domain/value-objects';
import { WorkflowError } from '../domain/errors';
import type { PlatformConfig } from '../domain/types/PlatformConfig';

export interface RunTestInput {
    url?: string;
    platformConfig?: PlatformConfig;
    prompt: string;
    options?: {
        maxSteps?: number;
        maxDurationMs?: number;
        maxEstimatedTokens?: number;
        maxRetries?: number;
        recoveryMode?: 'observe' | 'manual-only' | 'auto-safe';
        recoveryRunId?: string;
        temporalObservation?: boolean;
        temporalBurstFrames?: number;
        preferredSkillId?: string;
        allowedSkillTrustLevels?: ('draft' | 'verified' | 'restricted')[];
        pluginPreflight?: {
            pluginId: string;
            capability: import('../domain/plugins/PluginManifest').PluginCapability;
        };
        readinessMode?: 'observe' | 'soft-enforce';
        headless?: boolean;
        vision?: boolean;
        debugScreenshots?: boolean;
    };
}

export type RunTestOutput =
    | { type: 'started'; testRunId: TestRunId }
    | { type: 'observing' }
    | { type: 'thinking' }
    | { type: 'acting'; action: AgentAction }
    | { type: 'state_updated'; state: import('../domain/value-objects').WorkflowState }
    | { type: 'completed'; success: boolean; summary?: string }
    | { type: 'error'; error: WorkflowError | Error };
