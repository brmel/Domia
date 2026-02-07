/**
 * Integration Test: RunTestUseCase
 * 
 * Tests the full agent loop with real browser automation and LLM.
 * Requires GOOGLE_API_KEY environment variable to be set.
 * 
 * Run with: npm run test:integration
 */
import 'dotenv/config';
import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { container } from 'tsyringe';

import { PlaywrightAdapter } from '@infrastructure/adapters/browser/PlaywrightAdapter';
import { GeminiAdapter } from '@infrastructure/adapters/llm/GeminiAdapter';
import type { LLMConfig } from '@infrastructure/adapters/llm';
import { FileSystemAdapter } from '@infrastructure/adapters/storage';
import { ConsoleLogger } from '@infrastructure/adapters/logger/ConsoleLogger';
import { RunTestUseCase } from '@application/use-cases';
import { CancellationTokenSource } from '@domain/events';

describe('RunTestUseCase Integration', () => {
    beforeAll(() => {
        container.register('IBrowserAutomation', { useClass: PlaywrightAdapter });
        container.register('IArtifactStorage', { useClass: FileSystemAdapter });
        container.register('ILogger', { useClass: ConsoleLogger });

        const llmConfig: LLMConfig = {
            provider: 'google',
            model: 'gemini-2.0-flash',
            apiKey: process.env['GOOGLE_API_KEY'] ?? process.env['GEMINI_API_KEY'] ?? '',
        };
        container.register('LLMConfig', { useValue: llmConfig });
        container.register('ILLMProvider', { useClass: GeminiAdapter });
        container.register('RunTestUseCase', { useClass: RunTestUseCase });
    });

    afterAll(() => {
        container.reset();
    });

    it('should verify google.com loads and has a centered search bar', async () => {
        const apiKey = process.env['GOOGLE_API_KEY'] ?? process.env['GEMINI_API_KEY'];
        if (!apiKey) {
            console.log('Skipping: GOOGLE_API_KEY not set');
            return;
        }

        const useCase = container.resolve<RunTestUseCase>('RunTestUseCase');
        const cancellation = new CancellationTokenSource();

        const input = {
            url: 'https://www.google.com' as const,
            prompt: 'Verify the page loads successfully and the search bar is horizontally centered on the page. If you can see the Google logo and search bar, pass the test.',
            options: { headless: true, maxSteps: 5 },
        };

        const events: Array<{ type: string }> = [];
        let finalResult: unknown = null;

        try {
            const generator = useCase.execute(input, cancellation.token);
            for await (const event of generator) {
                console.log(`Event: ${event.type}`);
                events.push({ type: event.type });
                if (event.type === 'completed' || event.type === 'error') {
                    finalResult = event;
                    break;
                }
            }
        } catch (error) {
            console.error('Test execution error:', error);
            throw error;
        }

        expect(events.length).toBeGreaterThan(0);
        expect(events.some(e => e.type === 'started')).toBe(true);
        console.log('Final result:', finalResult);
    }, 120000);
});
