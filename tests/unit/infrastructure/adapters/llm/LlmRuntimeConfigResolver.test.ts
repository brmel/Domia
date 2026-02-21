import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { LlmRuntimeConfigResolver } from '@infrastructure/adapters/llm/LlmRuntimeConfigResolver';
import type { IConfigService } from '@domain/ports';

function createMockConfigService(overrides: Partial<{
    provider: string;
    model: string;
    apiKey: string;
    baseUrl: string;
    visionEnabled: boolean;
}> = {}): IConfigService {
    return {
        get: vi.fn().mockReturnValue({
            ai: {
                provider: overrides.provider ?? 'google',
                model: overrides.model ?? 'gemini-2.0-flash',
                apiKey: overrides.apiKey ?? 'config-key',
                baseUrl: overrides.baseUrl,
                visionEnabled: overrides.visionEnabled ?? true,
                debugScreenshots: false,
            },
            headless: true,
            viewport: { width: 1280, height: 720 },
            selectorEngine: { strategy: 'auto' },
            paths: { artifactsDir: './artifacts' },
            limits: { maxSteps: 20, delayBetweenSteps: 0, maxReplansPerRun: 3 },
        }),
        update: vi.fn(),
    } as unknown as IConfigService;
}

describe('LlmRuntimeConfigResolver', () => {
    const envKeys = [
        'DOMIA_LLM_PROVIDER',
        'DOMIA_LLM_MODEL',
        'DOMIA_LLM_BASE_URL',
        'DOMIA_LLM_API_KEY',
        'GOOGLE_API_KEY',
        'GEMINI_API_KEY',
    ];
    const savedEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
        envKeys.forEach(k => {
            savedEnv[k] = process.env[k];
            delete process.env[k];
        });
    });

    afterEach(() => {
        envKeys.forEach(k => {
            if (savedEnv[k] !== undefined) {
                process.env[k] = savedEnv[k];
            } else {
                delete process.env[k];
            }
        });
    });

    it('returns config service values when no env vars are set', () => {
        const configService = createMockConfigService();
        const resolver = new LlmRuntimeConfigResolver(configService);

        const result = resolver.resolve();

        expect(result.provider).toBe('google');
        expect(result.model).toBe('gemini-2.0-flash');
        expect(result.apiKey).toBe('config-key');
    });

    it('DOMIA_LLM_PROVIDER overrides config provider', () => {
        process.env['DOMIA_LLM_PROVIDER'] = 'openai';
        const resolver = new LlmRuntimeConfigResolver(createMockConfigService());

        expect(resolver.resolve().provider).toBe('openai');
    });

    it('DOMIA_LLM_MODEL overrides config model', () => {
        process.env['DOMIA_LLM_MODEL'] = 'gemini-pro';
        const resolver = new LlmRuntimeConfigResolver(createMockConfigService());

        expect(resolver.resolve().model).toBe('gemini-pro');
    });

    it('DOMIA_LLM_BASE_URL overrides config baseUrl', () => {
        process.env['DOMIA_LLM_BASE_URL'] = 'https://custom.api.com';
        const resolver = new LlmRuntimeConfigResolver(createMockConfigService());

        expect(resolver.resolve().baseUrl).toBe('https://custom.api.com');
    });

    it('API key priority: DOMIA_LLM_API_KEY > GOOGLE_API_KEY > GEMINI_API_KEY > config', () => {
        const configService = createMockConfigService({ apiKey: 'config-key' });
        const resolver = new LlmRuntimeConfigResolver(configService);

        // Config only
        expect(resolver.resolve().apiKey).toBe('config-key');

        // GEMINI_API_KEY overrides config
        process.env['GEMINI_API_KEY'] = 'gemini-key';
        expect(resolver.resolve().apiKey).toBe('gemini-key');

        // GOOGLE_API_KEY overrides GEMINI_API_KEY
        process.env['GOOGLE_API_KEY'] = 'google-key';
        expect(resolver.resolve().apiKey).toBe('google-key');

        // DOMIA_LLM_API_KEY overrides all
        process.env['DOMIA_LLM_API_KEY'] = 'domia-key';
        expect(resolver.resolve().apiKey).toBe('domia-key');
    });

    it('omits apiKey when not available anywhere', () => {
        const configService = createMockConfigService({ apiKey: undefined as unknown as string });
        (configService.get as ReturnType<typeof vi.fn>).mockReturnValue({
            ai: { provider: 'google', model: 'gemini-2.0-flash', visionEnabled: true, debugScreenshots: false },
            headless: true,
            viewport: { width: 1280, height: 720 },
            selectorEngine: { strategy: 'auto' },
            paths: { artifactsDir: './artifacts' },
            limits: { maxSteps: 20, delayBetweenSteps: 0, maxReplansPerRun: 3 },
        });
        const resolver = new LlmRuntimeConfigResolver(configService);

        const result = resolver.resolve();
        expect(result.apiKey).toBeUndefined();
    });

    it('omits baseUrl when not available anywhere', () => {
        const configService = createMockConfigService();
        const resolver = new LlmRuntimeConfigResolver(configService);

        expect(resolver.resolve().baseUrl).toBeUndefined();
    });
});
