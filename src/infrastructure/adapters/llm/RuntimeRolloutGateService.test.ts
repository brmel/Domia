import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { RuntimeRolloutGateService } from './RuntimeRolloutGateService';
import type { IConfigService, ILogger } from '@domain/ports';
import type { DomiaConfig } from '@shared/config-types';

function createConfig(overrides?: Partial<DomiaConfig>): DomiaConfig {
    return {
        headless: true,
        viewport: { width: 1280, height: 800 },
        ai: {
            provider: 'google',
            model: 'gemini-2.0-flash',
            apiKey: undefined,
            baseUrl: undefined,
            visionEnabled: false,
            debugScreenshots: false,
        },
        selectorEngine: { strategyOrder: ['fast', 'semantic', 'visual', 'heuristic'] },
        paths: { artifactsDir: './artifacts', databasePath: './domia.db' },
        limits: {
            maxSteps: 20,
            delayBetweenSteps: 1000,
            maxReplansPerRun: 2,
            temporalWindowRetentionCount: 30,
            temporalWindowMaxBytesPerRun: 2_000_000,
        },
        verification: {
            enforceSupervisedTerminalPass: true,
            terminalPassMinConfidence: 0.9,
            terminalPassMinEvidenceItems: 2,
        },
        rollout: {
            agenticRuntime: {
                enabled: true,
                shadowMode: false,
                sloGates: {
                    enabled: false,
                    minimumSamples: 3,
                    minimumMultilingualSamples: 2,
                    thresholds: {
                        toolCallValidityRate: 0.8,
                        maxRetryRate: 0.5,
                        maxTerminalFailureRate: 0.4,
                        multilingualVerificationPassRate: 0.7,
                    },
                },
            },
        },
        ...overrides,
    };
}

function createService(config: DomiaConfig): RuntimeRolloutGateService {
    const configService: IConfigService = {
        get: () => config,
        update: vi.fn(),
    };

    const logger: ILogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };

    return new RuntimeRolloutGateService(configService, logger);
}

describe('RuntimeRolloutGateService', () => {
    it('disables agentic mode when feature flag is off', () => {
        const service = createService(createConfig({
            rollout: {
                agenticRuntime: {
                    enabled: false,
                    shadowMode: false,
                    sloGates: {
                        enabled: false,
                        minimumSamples: 3,
                        minimumMultilingualSamples: 2,
                        thresholds: {
                            toolCallValidityRate: 0.8,
                            maxRetryRate: 0.5,
                            maxTerminalFailureRate: 0.4,
                            multilingualVerificationPassRate: 0.7,
                        },
                    },
                },
            },
        }));

        const mode = service.resolveMode();

        expect(mode.agenticEnabled).toBe(false);
        expect(mode.reason).toBe('disabled_by_feature_flag');
    });

    it('enables agentic mode and shadow mode when gates are disabled', () => {
        const service = createService(createConfig({
            rollout: {
                agenticRuntime: {
                    enabled: true,
                    shadowMode: true,
                    sloGates: {
                        enabled: false,
                        minimumSamples: 3,
                        minimumMultilingualSamples: 2,
                        thresholds: {
                            toolCallValidityRate: 0.8,
                            maxRetryRate: 0.5,
                            maxTerminalFailureRate: 0.4,
                            multilingualVerificationPassRate: 0.7,
                        },
                    },
                },
            },
        }));

        const mode = service.resolveMode();

        expect(mode.agenticEnabled).toBe(true);
        expect(mode.shadowMode).toBe(true);
        expect(mode.reason).toBe('enabled_without_slo_gate');
    });

    it('does not enforce SLO gate before minimum samples', () => {
        const service = createService(createConfig({
            rollout: {
                agenticRuntime: {
                    enabled: true,
                    shadowMode: false,
                    sloGates: {
                        enabled: true,
                        minimumSamples: 4,
                        minimumMultilingualSamples: 2,
                        thresholds: {
                            toolCallValidityRate: 1,
                            maxRetryRate: 0,
                            maxTerminalFailureRate: 0,
                            multilingualVerificationPassRate: 1,
                        },
                    },
                },
            },
        }));

        service.recordDecision({ validToolCall: false, usedRetry: true, terminalFailure: true });
        service.recordDecision({ validToolCall: false, usedRetry: true, terminalFailure: true });

        const mode = service.resolveMode();

        expect(mode.agenticEnabled).toBe(true);
    });

    it('blocks rollout when tool-call validity SLO is violated', () => {
        const service = createService(createConfig({
            rollout: {
                agenticRuntime: {
                    enabled: true,
                    shadowMode: false,
                    sloGates: {
                        enabled: true,
                        minimumSamples: 3,
                        minimumMultilingualSamples: 0,
                        thresholds: {
                            toolCallValidityRate: 0.8,
                            maxRetryRate: 1,
                            maxTerminalFailureRate: 1,
                            multilingualVerificationPassRate: 0,
                        },
                    },
                },
            },
        }));

        service.recordDecision({ validToolCall: true, usedRetry: false, terminalFailure: false });
        service.recordDecision({ validToolCall: false, usedRetry: false, terminalFailure: true });
        service.recordDecision({ validToolCall: false, usedRetry: false, terminalFailure: true });

        const mode = service.resolveMode();

        expect(mode.agenticEnabled).toBe(false);
        expect(mode.reason).toBe('slo_gate_tool_call_validity');
    });

    it('blocks rollout when multilingual pass rate is below threshold', () => {
        const service = createService(createConfig({
            rollout: {
                agenticRuntime: {
                    enabled: true,
                    shadowMode: false,
                    sloGates: {
                        enabled: true,
                        minimumSamples: 2,
                        minimumMultilingualSamples: 2,
                        thresholds: {
                            toolCallValidityRate: 0,
                            maxRetryRate: 1,
                            maxTerminalFailureRate: 1,
                            multilingualVerificationPassRate: 0.75,
                        },
                    },
                },
            },
        }));

        service.recordDecision({ validToolCall: true, usedRetry: false, terminalFailure: false });
        service.recordDecision({ validToolCall: true, usedRetry: false, terminalFailure: false });
        service.recordMultilingualVerification(true);
        service.recordMultilingualVerification(false);

        const mode = service.resolveMode();

        expect(mode.agenticEnabled).toBe(false);
        expect(mode.reason).toBe('slo_gate_multilingual_pass_rate');
    });
});
