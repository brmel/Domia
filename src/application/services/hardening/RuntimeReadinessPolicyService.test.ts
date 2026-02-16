import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeReadinessPolicyService } from './RuntimeReadinessPolicyService';
import { ReadinessGateService } from './ReadinessGateService';

function makeService(apiKey?: string) {
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    };

    const configService = {
        get: () => ({
            headless: true,
            viewport: { width: 1280, height: 800 },
            ai: { provider: 'google', model: 'gemini-2.0-flash', apiKey, visionEnabled: false, debugScreenshots: false },
            selectorEngine: { strategyOrder: ['fast', 'semantic', 'visual', 'heuristic'] },
            paths: { artifactsDir: './artifacts', databasePath: './domia.db' },
            limits: { maxSteps: 20, delayBetweenSteps: 1000 }
        })
    };

    const service = new RuntimeReadinessPolicyService(new ReadinessGateService(), configService as unknown as never, logger as unknown as never);
    return { service, logger };
}

describe('RuntimeReadinessPolicyService', () => {
    beforeEach(() => {
        delete process.env['DOMIA_READINESS_MODE'];
        delete process.env['DOMIA_ENV_PROFILE'];
        delete process.env['DOMIA_ENABLE_READINESS_GATES'];
    });

    it('does not block in observe mode even with required gate failure', () => {
        process.env['DOMIA_ENV_PROFILE'] = 'staging';

        const { service } = makeService(undefined);
        const decision = service.assess({ prompt: 'test', options: {} }, 'https://example.com');
        expect(decision.blocked).toBe(false);
        expect(decision.report.passed).toBe(false);
    });

    it('does not block in explicit observe mode even with required gate failure', () => {
        process.env['DOMIA_READINESS_MODE'] = 'observe';
        process.env['DOMIA_ENV_PROFILE'] = 'staging';

        const { service } = makeService(undefined);
        const decision = service.assess({ prompt: 'test', options: {} }, 'https://example.com');

        expect(decision.blocked).toBe(false);
        expect(decision.report.passed).toBe(false);
    });

    it('blocks in soft-enforce mode when required gates fail', () => {
        process.env['DOMIA_READINESS_MODE'] = 'soft-enforce';
        process.env['DOMIA_ENV_PROFILE'] = 'staging';

        const { service } = makeService(undefined);
        const decision = service.assess({ prompt: 'test', options: {} }, 'https://example.com');

        expect(decision.blocked).toBe(true);
    });

    it('requires API key in staging profile even in observe mode', () => {
        process.env['DOMIA_ENV_PROFILE'] = 'staging';

        const { service } = makeService(undefined);
        const decision = service.assess({ prompt: 'test', options: {} }, 'https://example.com');

        expect(decision.report.failedRequiredGateIds).toContain('llm_api_key_present');
    });

    it('requires readiness flag and soft-enforce mode in production profile', () => {
        process.env['DOMIA_ENV_PROFILE'] = 'production';
        process.env['DOMIA_READINESS_MODE'] = 'observe';
        process.env['DOMIA_ENABLE_READINESS_GATES'] = 'false';

        const { service } = makeService('api-key');
        const decision = service.assess({ prompt: 'test', options: {} }, 'https://example.com');

        expect(decision.report.failedRequiredGateIds).toContain('readiness_flag_enabled');
        expect(decision.report.failedRequiredGateIds).toContain('readiness_mode_soft_enforce');
    });

    it('passes production profile when readiness prerequisites are satisfied', () => {
        process.env['DOMIA_ENV_PROFILE'] = 'production';
        process.env['DOMIA_READINESS_MODE'] = 'soft-enforce';
        process.env['DOMIA_ENABLE_READINESS_GATES'] = 'true';

        const { service } = makeService('api-key');
        const decision = service.assess({ prompt: 'test', options: {} }, 'https://example.com');

        expect(decision.report.passed).toBe(true);
    });
});
