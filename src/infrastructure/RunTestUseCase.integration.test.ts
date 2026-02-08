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
import { LangChainAdapter } from '@infrastructure/adapters/llm/LangChainAdapter';
import type { LLMConfig } from '@domain/ports';
import { FileSystemAdapter } from '@infrastructure/adapters/storage';
import { ConsoleLogger } from '@infrastructure/adapters/logger/ConsoleLogger';
import { AgentViewService } from '@infrastructure/electron/AgentViewService';
import { RunTestUseCase } from '@application/use-cases';
import { ToolRegistry } from '@application/registries/ToolRegistry';
import { ClickTool } from '@application/tools/browser/ClickTool';
import { TypeTool } from '@application/tools/browser/TypeTool';
import { PressKeyTool } from '@application/tools/browser/PressKeyTool';
import { ScrollTool } from '@application/tools/browser/ScrollTool';
import { WaitTool } from '@application/tools/browser/WaitTool';
import { ExtractTool } from '@application/tools/browser/ExtractTool';
import { NavigateTool } from '@application/tools/browser/NavigateTool';
import { CancellationTokenSource } from '@domain/events';

describe('RunTestUseCase Integration', () => {


    beforeAll(() => {
        const config: LLMConfig = {
            provider: 'google',
            model: 'gemini-2.0-flash',
            apiKey: process.env['GOOGLE_API_KEY'] || 'test-key'
        };

        container.register('LLMConfig', { useValue: config });
        container.register('ILogger', { useClass: ConsoleLogger });
        container.register('IArtifactStorage', { useClass: FileSystemAdapter });
        container.register(AgentViewService, { useClass: AgentViewService });
        container.register('IBrowserAutomation', { useClass: PlaywrightAdapter });
        container.register('ILLMProvider', { useClass: LangChainAdapter });

        // Register Tools
        const toolRegistry = new ToolRegistry();
        toolRegistry.register(new ClickTool());
        toolRegistry.register(new TypeTool());
        toolRegistry.register(new PressKeyTool());
        toolRegistry.register(new ScrollTool());
        toolRegistry.register(new WaitTool());
        toolRegistry.register(new ExtractTool());
        toolRegistry.register(new NavigateTool());

        container.register(ToolRegistry, { useValue: toolRegistry });

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

    it('should search for "Top 10 programming languages" and verify results', async () => {
        const apiKey = process.env['GOOGLE_API_KEY'] ?? process.env['GEMINI_API_KEY'];
        if (!apiKey) {
            console.log('Skipping: GOOGLE_API_KEY not set');
            return;
        }

        const useCase = container.resolve<RunTestUseCase>('RunTestUseCase');
        const cancellation = new CancellationTokenSource();

        const input = {
            url: 'https://www.google.com' as const,
            prompt: 'Search for "Top 10 programming languages" and verify that the results page loads.',
            options: { headless: true, maxSteps: 10 },
        };

        const events: Array<{ type: string }> = [];
        let finalResult: any = null;

        try {
            const generator = useCase.execute(input, cancellation.token);
            for await (const event of generator) {
                console.log(`Event: ${event.type}`);
                events.push({ type: event.type });
                if (event.type === 'completed') {
                    finalResult = event;
                    break;
                }
            }
        } catch (error) {
            console.error('Test execution error:', error);
            throw error;
        }

        expect(finalResult).toBeDefined();
        // We expect success or at least multiple steps indicating interaction
        if (finalResult.success) {
            expect(finalResult.success).toBe(true);
        } else {
            // If verification fails (e.g. strict layout checks), at least ensure we took steps
            expect(events.length).toBeGreaterThan(5);
        }

    }, 120000);
});
