import { inject, injectable } from 'tsyringe';
import type { IConfigService, ILogger } from '@domain/ports';
import type { RunOptions } from '@shared/validation';
import { ReadinessGateService, type ReadinessReport } from './ReadinessGateService';

export type RuntimeReadinessMode = 'observe' | 'soft-enforce';

export interface RuntimeReadinessDecision {
    readonly mode: RuntimeReadinessMode;
    readonly blocked: boolean;
    readonly report: ReadinessReport;
    readonly message?: string;
}

export interface RuntimeReadinessInput {
    readonly prompt: string;
    readonly options?: RunOptions;
}

@injectable()
export class RuntimeReadinessPolicyService {
    constructor(
        @inject(ReadinessGateService) private readonly readinessGateService: ReadinessGateService,
        @inject('IConfigService') private readonly configService: IConfigService,
        @inject('ILogger') private readonly logger: ILogger
    ) {}

    assess(input: RuntimeReadinessInput, resolvedUrl: string): RuntimeReadinessDecision {
        const enabled = process.env['DOMIA_ENABLE_READINESS_GATES'] === 'true';
        const mode = this.resolveMode(input.options?.readinessMode);

        const config = this.configService.get();
        const apiKeyPresent = Boolean(config.ai.apiKey?.trim());

        const temporalFlagEnabled = process.env['DOMIA_ENABLE_TEMPORAL_OBSERVATION'] === 'true';
        const recoveryFlagEnabled = process.env['DOMIA_ENABLE_RECOVERY_SCAFFOLD'] === 'true';
        const skillFlagEnabled = process.env['DOMIA_ENABLE_SKILL_SCAFFOLD'] === 'true';
        const pluginFlagEnabled = process.env['DOMIA_ENABLE_PLUGIN_SCAFFOLD'] === 'true';

        const report = this.readinessGateService.evaluate([
            {
                id: 'prompt_non_empty',
                description: 'Prompt must be non-empty',
                required: true,
                passed: input.prompt.trim().length > 0
            },
            {
                id: 'resolved_url_valid',
                description: 'Resolved URL must use supported scheme',
                required: true,
                passed: resolvedUrl.startsWith('http://') || resolvedUrl.startsWith('https://') || resolvedUrl.startsWith('electron://')
            },
            {
                id: 'llm_api_key_present',
                description: 'AI API key should be configured',
                required: true,
                passed: apiKeyPresent
            },
            {
                id: 'temporal_flag_alignment',
                description: 'Temporal observation option should align with feature flag',
                required: false,
                passed: !input.options?.temporalObservation || temporalFlagEnabled
            },
            {
                id: 'recovery_flag_alignment',
                description: 'Recovery options should align with feature flag',
                required: false,
                passed: !input.options?.recoveryRunId || recoveryFlagEnabled
            },
            {
                id: 'skill_flag_alignment',
                description: 'Skill preflight should align with feature flag',
                required: false,
                passed: !input.options?.preferredSkillId || skillFlagEnabled
            },
            {
                id: 'plugin_flag_alignment',
                description: 'Plugin preflight should align with feature flag',
                required: false,
                passed: !input.options?.pluginPreflight || pluginFlagEnabled
            }
        ]);

        if (!enabled) {
            return {
                mode,
                blocked: false,
                report
            };
        }

        if (report.passed) {
            this.logger.debug('[RuntimeReadinessPolicyService] Readiness checks passed', {
                mode,
                gateCount: report.gates.length
            });
            return {
                mode,
                blocked: false,
                report
            };
        }

        const message = `Readiness required gates failed: ${report.failedRequiredGateIds.join(', ')}`;

        if (mode === 'soft-enforce') {
            this.logger.warn('[RuntimeReadinessPolicyService] Blocking run in soft-enforce mode', {
                failedRequiredGateIds: report.failedRequiredGateIds
            });
            return {
                mode,
                blocked: true,
                report,
                message
            };
        }

        this.logger.warn('[RuntimeReadinessPolicyService] Observe mode: readiness failures logged only', {
            failedRequiredGateIds: report.failedRequiredGateIds
        });

        return {
            mode,
            blocked: false,
            report,
            message
        };
    }

    private resolveMode(optionMode: 'observe' | 'soft-enforce' | undefined): RuntimeReadinessMode {
        if (optionMode === 'observe' || optionMode === 'soft-enforce') {
            return optionMode;
        }

        const envMode = process.env['DOMIA_READINESS_MODE'];
        return envMode === 'soft-enforce' ? 'soft-enforce' : 'observe';
    }
}
