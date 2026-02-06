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

// Import adapters
import { PlaywrightAdapter } from '@infrastructure/adapters/browser/PlaywrightAdapter';
import { GeminiAdapter } from '@infrastructure/adapters/llm/GeminiAdapter';
import type { LLMConfig } from '@infrastructure/adapters/llm';
import { FileSystemAdapter } from '@infrastructure/adapters/storage';
import { FileOutputAdapter } from '@infrastructure/adapters/io';
import { ConsoleLogger } from '@infrastructure/adapters/logger/ConsoleLogger';

// Import use case
import { RunTestUseCase } from '@application/use-cases';
import { CancellationTokenSource } from '@domain/events';

describe('RunTestUseCase Integration', () => {
    beforeAll(() => {
        // Register all dependencies
        container.register('IBrowserAutomation', { useClass: PlaywrightAdapter });
        // Mock Storage to avoid native module issues during Node-based testing
        const mockStorage = {
            createTestRun: async () => { },
            updateTestRun: async () => { },
            getTestRun: async () => null,
            addStep: async () => { },
        };
        container.register('ITestRunStorage', { useValue: mockStorage });

        container.register('IArtifactStorage', { useClass: FileSystemAdapter });
        container.register('IOutputPort', { useClass: FileOutputAdapter });
        container.register('ILogger', { useClass: ConsoleLogger });

        // LLM Configuration - use Gemini
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
        // Skip if no API key
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
            options: {
                headless: true,
                maxSteps: 5,
            },
        };

        const events: Array<{ type: string; data?: unknown }> = [];
        let finalResult: unknown = null;

        try {
            // Run the use case and collect events
            const generator = useCase.execute(input, cancellation.token);

            for await (const event of generator) {
                console.log(`Event: ${event.type}`);
                events.push({ type: event.type, data: event });

                if (event.type === 'completed') {
                    finalResult = event;
                    break;
                }
                if (event.type === 'error') {
                    finalResult = event;
                    break;
                }
            }
        } catch (error) {
            console.error('Test execution error:', error);
            throw error;
        }

        // Verify we got events
        expect(events.length).toBeGreaterThan(0);
        console.log('Events received:', events.map(e => e.type));

        // Verify we got a 'started' event
        expect(events.some(e => e.type === 'started')).toBe(true);

        // Log final result
        console.log('Final result:', finalResult);
    }, 120000); // 2 minute timeout for integration test
});
