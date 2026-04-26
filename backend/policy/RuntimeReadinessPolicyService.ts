import { inject, injectable } from 'tsyringe';
import type { IConfigService, ILogger } from '@domain/ports';
import type { RunOptions } from '@shared/contracts/run';

@injectable()
export class RuntimeReadinessPolicyService {
    constructor(
        @inject('IConfigService') private readonly configService: IConfigService,
        @inject('ILogger') private readonly logger: ILogger
    ) {}

    assess(input: { prompt: string; options?: RunOptions }, resolvedUrl: string) {
        const mode = input.options?.readinessMode ?? (process.env['DOMIA_READINESS_MODE'] === 'soft-enforce' ? 'soft-enforce' : 'observe') as 'observe' | 'soft-enforce';
        const profile = input.options?.readinessProfile ?? ((['staging', 'production'].includes(process.env['DOMIA_ENV_PROFILE'] ?? '') ? process.env['DOMIA_ENV_PROFILE'] : 'dev') as 'dev' | 'staging' | 'production');

        const apiKeyPresent = Boolean(this.configService.get().ai.apiKey?.trim());
        const readinessFlagEnabled = process.env['DOMIA_ENABLE_READINESS_GATES'] === 'true';

        const gates = [
            { id: 'prompt_non_empty', description: 'Prompt must be non-empty', required: true, passed: input.prompt.trim().length > 0 },
            { id: 'resolved_url_valid', description: 'Resolved URL must use supported scheme', required: true, passed: /^(https?|electron):\/\//.test(resolvedUrl) },
            { id: 'llm_api_key_present', description: 'AI API key should be configured', required: profile !== 'dev', passed: apiKeyPresent },
            { id: 'readiness_flag_enabled', description: 'Readiness gates should be explicitly enabled', required: profile === 'staging' || profile === 'production', passed: readinessFlagEnabled },
            { id: 'readiness_mode_soft_enforce', description: 'Readiness mode should be soft-enforce in production', required: profile === 'production', passed: mode === 'soft-enforce' },
        ];

        const failedRequired = gates.filter(g => g.required && !g.passed);
        const report = { passed: failedRequired.length === 0, failedRequiredGateIds: failedRequired.map(g => g.id), gates };

        if (report.passed) {
            return { mode, blocked: false, report };
        }

        const message = `Readiness required gates failed: ${report.failedRequiredGateIds.join(', ')}`;
        const blocked = mode === 'soft-enforce';

        this.logger.warn(`[RuntimeReadinessPolicyService] ${blocked ? 'Blocking' : 'Observe-only'}: ${message}`, {
            profile, failedRequiredGateIds: report.failedRequiredGateIds,
        });

        return { mode, blocked, report, message };
    }
}
