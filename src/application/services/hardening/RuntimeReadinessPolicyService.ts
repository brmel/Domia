import { inject, injectable } from 'tsyringe';
import type { IConfigService, ILogger } from '@domain/ports';
import type { RunOptions } from '@shared/validation';

export type RuntimeReadinessMode = 'observe' | 'soft-enforce';
export type RuntimeReadinessProfile = 'dev' | 'staging' | 'production';

export interface ReadinessGate {
    readonly id: string;
    readonly description: string;
    readonly required: boolean;
    readonly passed: boolean;
}

export interface ReadinessReport {
    readonly passed: boolean;
    readonly failedRequiredGateIds: readonly string[];
    readonly gates: readonly ReadinessGate[];
}

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

function evaluateGates(gates: readonly ReadinessGate[]): ReadinessReport {
    const failedRequiredGateIds = gates
        .filter(g => g.required && !g.passed)
        .map(g => g.id);
    return { passed: failedRequiredGateIds.length === 0, failedRequiredGateIds, gates };
}

@injectable()
export class RuntimeReadinessPolicyService {
    constructor(
        @inject('IConfigService') private readonly configService: IConfigService,
        @inject('ILogger') private readonly logger: ILogger
    ) {}

    assess(input: RuntimeReadinessInput, resolvedUrl: string): RuntimeReadinessDecision {
        const mode = this.resolveMode(input.options?.readinessMode);
        const profile = this.resolveProfile(input.options?.readinessProfile);

        const config = this.configService.get();
        const apiKeyPresent = Boolean(config.ai.apiKey?.trim());
        const readinessFlagEnabled = process.env['DOMIA_ENABLE_READINESS_GATES'] === 'true';

        const report = evaluateGates([
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
                required: profile !== 'dev',
                passed: apiKeyPresent
            },
            {
                id: 'readiness_flag_enabled',
                description: 'Readiness gates should be explicitly enabled',
                required: profile === 'staging' || profile === 'production',
                passed: readinessFlagEnabled
            },
            {
                id: 'readiness_mode_soft_enforce',
                description: 'Readiness mode should be soft-enforce in production',
                required: profile === 'production',
                passed: mode === 'soft-enforce'
            }
        ]);

        if (report.passed) {
            this.logger.debug('[RuntimeReadinessPolicyService] Readiness checks passed', {
                mode,
                profile,
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
                profile,
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
            profile,
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

    private resolveProfile(optionProfile: 'dev' | 'staging' | 'production' | undefined): RuntimeReadinessProfile {
        if (optionProfile === 'dev' || optionProfile === 'staging' || optionProfile === 'production') {
            return optionProfile;
        }

        const envProfile = process.env['DOMIA_ENV_PROFILE'];
        if (envProfile === 'staging' || envProfile === 'production') {
            return envProfile;
        }

        return 'dev';
    }
}
