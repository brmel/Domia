import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { GeminiModelFactory } from '@infrastructure/adapters/llm/GeminiModelFactory';
import type { LLMConfig } from '@domain/ports';

vi.mock('@google/generative-ai', () => {
    const mockModel = { generateContent: vi.fn() };
    return {
        GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
            getGenerativeModel: vi.fn().mockReturnValue(mockModel),
        })),
    };
});

function makeConfig(overrides: Partial<LLMConfig> = {}): LLMConfig {
    return {
        provider: 'google',
        model: 'gemini-2.0-flash',
        apiKey: 'test-key',
        ...overrides,
    };
}

describe('GeminiModelFactory', () => {
    it('creates a model for a valid google config', () => {
        const factory = new GeminiModelFactory();
        const model = factory.createModel(makeConfig());

        expect(model).toBeDefined();
        expect(model.generateContent).toBeDefined();
    });

    it('createPlanningModel creates a model the same way', () => {
        const factory = new GeminiModelFactory();
        const model = factory.createPlanningModel(makeConfig());

        expect(model).toBeDefined();
        expect(model.generateContent).toBeDefined();
    });

    it('throws LLMError for unsupported provider', () => {
        const factory = new GeminiModelFactory();

        expect(() => factory.createModel(makeConfig({ provider: 'openai' as LLMConfig['provider'] }))).toThrow(
            'Unsupported provider: openai'
        );
    });

    it('throws LLMError when API key is missing', () => {
        const factory = new GeminiModelFactory();

        expect(() => factory.createModel(makeConfig({ apiKey: undefined as unknown as string }))).toThrow(
            'Missing Google API key'
        );
    });

    it('describe returns provider/model without baseUrl', () => {
        const factory = new GeminiModelFactory();

        expect(factory.describe(makeConfig())).toBe('google/gemini-2.0-flash');
    });

    it('describe includes baseUrl when present', () => {
        const factory = new GeminiModelFactory();

        expect(factory.describe(makeConfig({ baseUrl: 'https://proxy.example.com' }))).toBe(
            'google/gemini-2.0-flash@https://proxy.example.com'
        );
    });
});
