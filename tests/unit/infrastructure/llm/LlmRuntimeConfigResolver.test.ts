import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { LlmRuntimeConfigResolver } from '@infrastructure/llm/LlmRuntimeConfigResolver';
import type { IConfigService } from '@domain/ports';

function createMockConfigService(overrides: Partial<{
    model: string;
    apiKey: string;
    visionEnabled: boolean;
}> = {}): IConfigService {
    return {
        get: vi.fn().mockReturnValue({
            ai: {
                provider: 'google',
                model: overrides.model ?? 'gemini-2.0-flash',
                apiKey: overrides.apiKey ?? 'config-key',
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
        'DOMIA_LLM_MODEL',
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

    it('provider is always google', () => {
        const resolver = new LlmRuntimeConfigResolver(createMockConfigService());
        expect(resolver.resolve().provider).toBe('google');
    });

    it('DOMIA_LLM_MODEL overrides config model', () => {
        process.env['DOMIA_LLM_MODEL'] = 'gemini-pro';
        const resolver = new LlmRuntimeConfigResolver(createMockConfigService());

        expect(resolver.resolve().model).toBe('gemini-pro');
    });

    it('API key priority: DOMIA_LLM_API_KEY > GOOGLE_API_KEY > GEMINI_API_KEY > config', () => {
        const configService = createMockConfigService({ apiKey: 'config-key' });
        const resolver = new LlmRuntimeConfigResolver(configService);

        expect(resolver.resolve().apiKey).toBe('config-key');

        process.env['GEMINI_API_KEY'] = 'gemini-key';
        expect(resolver.resolve().apiKey).toBe('gemini-key');

        process.env['GOOGLE_API_KEY'] = 'google-key';
        expect(resolver.resolve().apiKey).toBe('google-key');

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
});
