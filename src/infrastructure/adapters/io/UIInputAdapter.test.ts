import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { UIInputAdapter } from './UIInputAdapter';

describe('UIInputAdapter', () => {
    const adapter = new UIInputAdapter();

    describe('parse', () => {
        it('should parse valid input with url and prompt', () => {
            const result = adapter.parse({
                url: 'https://example.com',
                prompt: 'Click the login button',
            });

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value.url).toBe('https://example.com');
                expect(result.value.prompt).toBe('Click the login button');
            }
        });

        it('should parse valid input with options', () => {
            const result = adapter.parse({
                url: 'https://example.com',
                prompt: 'Test goal',
                options: {
                    headless: false,
                    maxSteps: 10,
                    provider: 'openai',
                },
            });

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value.options?.headless).toBe(false);
                expect(result.value.options?.maxSteps).toBe(10);
                expect(result.value.options?.provider).toBe('openai');
            }
        });

        it('should return error for invalid URL', () => {
            const result = adapter.parse({
                url: 'not-a-url',
                prompt: 'Test goal',
            });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toContain('Invalid URL');
            }
        });

        it('should return error for empty prompt', () => {
            const result = adapter.parse({
                url: 'https://example.com',
                prompt: '   ',
            });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toContain('empty');
            }
        });

        it('should return error for missing url', () => {
            const result = adapter.parse({
                prompt: 'Test goal',
            });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toContain('string');
            }
        });

        it('should return error for null input', () => {
            const result = adapter.parse(null);

            expect(result.isErr()).toBe(true);
        });

        it('should ignore invalid options', () => {
            const result = adapter.parse({
                url: 'https://example.com',
                prompt: 'Test goal',
                options: {
                    headless: 'not-a-boolean',
                    maxSteps: -1,
                },
            });

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value.options).toBeUndefined();
            }
        });
    });
});
