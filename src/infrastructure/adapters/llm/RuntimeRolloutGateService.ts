import { inject, injectable } from 'tsyringe';
import type { IConfigService, ILogger } from '@domain/ports';

export interface RolloutSloSnapshot {
    readonly totalDecisions: number;
    readonly validToolCalls: number;
    readonly retriedDecisions: number;
    readonly terminalFailures: number;
    readonly multilingualSamples: number;
    readonly multilingualPasses: number;
}

export interface RuntimeRolloutMode {
    readonly agenticEnabled: boolean;
    readonly shadowMode: boolean;
    readonly reason: string;
}

interface RolloutDecisionSample {
    readonly validToolCall: boolean;
    readonly usedRetry: boolean;
    readonly terminalFailure: boolean;
}

@injectable()
export class RuntimeRolloutGateService {
    private metrics: RolloutSloSnapshot = {
        totalDecisions: 0,
        validToolCalls: 0,
        retriedDecisions: 0,
        terminalFailures: 0,
        multilingualSamples: 0,
        multilingualPasses: 0,
    };

    constructor(
        @inject('IConfigService') private readonly configService: IConfigService,
        @inject('ILogger') private readonly logger: ILogger,
    ) { }

    resolveMode(): RuntimeRolloutMode {
        const rolloutConfig = this.configService.get().rollout.agenticRuntime;

        if (!rolloutConfig.enabled) {
            return {
                agenticEnabled: false,
                shadowMode: false,
                reason: 'disabled_by_feature_flag',
            };
        }

        if (!rolloutConfig.sloGates.enabled) {
            return {
                agenticEnabled: true,
                shadowMode: rolloutConfig.shadowMode,
                reason: 'enabled_without_slo_gate',
            };
        }

        const gateReason = this.evaluateSloGate(rolloutConfig.sloGates);
        if (gateReason) {
            this.logger.warn('[RuntimeRolloutGateService] Agentic runtime SLO gate blocked rollout', {
                reason: gateReason,
                metrics: this.metrics,
            });

            return {
                agenticEnabled: false,
                shadowMode: false,
                reason: gateReason,
            };
        }

        return {
            agenticEnabled: true,
            shadowMode: rolloutConfig.shadowMode,
            reason: 'enabled_with_slo_gate',
        };
    }

    recordDecision(sample: RolloutDecisionSample): void {
        this.metrics = {
            ...this.metrics,
            totalDecisions: this.metrics.totalDecisions + 1,
            validToolCalls: this.metrics.validToolCalls + (sample.validToolCall ? 1 : 0),
            retriedDecisions: this.metrics.retriedDecisions + (sample.usedRetry ? 1 : 0),
            terminalFailures: this.metrics.terminalFailures + (sample.terminalFailure ? 1 : 0),
        };
    }

    recordMultilingualVerification(pass: boolean): void {
        this.metrics = {
            ...this.metrics,
            multilingualSamples: this.metrics.multilingualSamples + 1,
            multilingualPasses: this.metrics.multilingualPasses + (pass ? 1 : 0),
        };
    }

    getSnapshot(): RolloutSloSnapshot {
        return this.metrics;
    }

    private evaluateSloGate(sloGateConfig: {
        enabled: boolean;
        minimumSamples: number;
        minimumMultilingualSamples: number;
        thresholds: {
            toolCallValidityRate: number;
            maxRetryRate: number;
            maxTerminalFailureRate: number;
            multilingualVerificationPassRate: number;
        };
    }): string | null {
        if (this.metrics.totalDecisions < sloGateConfig.minimumSamples) {
            return null;
        }

        const toolCallValidityRate = this.metrics.validToolCalls / this.metrics.totalDecisions;
        const retryRate = this.metrics.retriedDecisions / this.metrics.totalDecisions;
        const terminalFailureRate = this.metrics.terminalFailures / this.metrics.totalDecisions;

        if (toolCallValidityRate < sloGateConfig.thresholds.toolCallValidityRate) {
            return 'slo_gate_tool_call_validity';
        }

        if (retryRate > sloGateConfig.thresholds.maxRetryRate) {
            return 'slo_gate_retry_rate';
        }

        if (terminalFailureRate > sloGateConfig.thresholds.maxTerminalFailureRate) {
            return 'slo_gate_terminal_failure_rate';
        }

        if (this.metrics.multilingualSamples >= sloGateConfig.minimumMultilingualSamples) {
            const multilingualPassRate = this.metrics.multilingualPasses / this.metrics.multilingualSamples;
            if (multilingualPassRate < sloGateConfig.thresholds.multilingualVerificationPassRate) {
                return 'slo_gate_multilingual_pass_rate';
            }
        }

        return null;
    }
}
