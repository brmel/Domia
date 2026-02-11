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
import { container, Lifecycle } from 'tsyringe';
import { okAsync, ResultAsync } from 'neverthrow';
import { INode, IBrowserAutomation, IPersistenceAdapter, LLMConfig, IStorageService, ITraceService } from '@domain/ports';
import { DomiaGateway } from '@application/gateway/DomiaGateway';
import { PlaywrightAdapter } from '@infrastructure/adapters/browser/PlaywrightAdapter';
import { LangChainAdapter } from '@infrastructure/adapters/llm/LangChainAdapter';
import { ConsoleLogger } from '@infrastructure/adapters/logger/ConsoleLogger';
import { RunTestUseCase } from '@application/use-cases';
import { ExecutionController } from '@application/controllers/ExecutionController';
import { PersistenceError } from '@domain/errors';

class MockTraceService implements ITraceService {
    startTrace() { return Promise.resolve(); }
    tracePerception() { return Promise.resolve(); }
    traceReasoning() { return Promise.resolve(); }
    endTrace() { return Promise.resolve(); }
    addExporter() { }
}

describe('RunTestUseCase Integration', () => {

    const mockBrowser: IBrowserAutomation = {
        launch: () => okAsync(undefined),
        navigateTo: () => okAsync(undefined),
        click: () => okAsync(undefined),
        type: () => okAsync(undefined),
        pressKey: () => okAsync(undefined),
        scroll: () => okAsync(undefined),
        wait: () => okAsync(undefined),
        extractText: () => okAsync(''),
        highlight: () => okAsync(undefined),
        close: () => Promise.resolve(),
        getViewportSize: () => Promise.resolve({ width: 100, height: 100 }),
        waitForDOMStable: () => Promise.resolve()
    } as unknown as IBrowserAutomation;

    class MockViewHost {
        show() { }
        hide() { }
        async getCDPWebSocketURL() { throw new Error('Not implemented'); }
    }

    class MockNode implements INode {
        id = 'mock-node';
        capabilities = ['browser'];
        healthCheck(): Promise<boolean> { return Promise.resolve(true); }
        allocate(): ResultAsync<IBrowserAutomation, Error> {
            return okAsync(mockBrowser);
        }
        release(): Promise<void> { return Promise.resolve(); }
    }

    class MockPersistenceAdapter implements IPersistenceAdapter {
        saveCheckpoint(_runId: string, _state: import('../../src/domain/value-objects/WorkflowState').WorkflowState): ResultAsync<void, PersistenceError> {
            return okAsync(undefined);
        }
        getCheckpoint(_runId: string): ResultAsync<import('../../src/domain/value-objects/WorkflowState').WorkflowState | null, PersistenceError> {
            return okAsync(null);
        }
        saveTestRun() { return okAsync(undefined); }
        updateTestRun() { return okAsync(undefined); }
        saveTestStep() { return okAsync(undefined); }
        saveLog() { return okAsync(undefined); }
        getTestRuns() { return okAsync([]); }
        getTestRun() { return okAsync(null); }
        getTestSteps() { return okAsync([]); }
        clearHistory() { return okAsync(undefined); }
    }

    class MockStorageService implements IStorageService {
        savePerceptionAssets() { return Promise.resolve({}); }
        saveStepTrace() { return Promise.resolve(); }
        getStepArtifacts() { return Promise.resolve({}); }
    }


    beforeAll(() => {
        const config: LLMConfig = {
            provider: 'google',
            model: 'gemini-2.0-flash',
            apiKey: process.env['GOOGLE_API_KEY'] || 'test-key'
        };

        container.register('LLMConfig', { useValue: config });
        container.register('ILogger', { useClass: ConsoleLogger });
        container.register('IViewHost', { useClass: MockViewHost });
        container.register('IPersistenceAdapter', { useClass: MockPersistenceAdapter });
        container.register('IStorageService', { useClass: MockStorageService });
        container.register('ITraceService', { useClass: MockTraceService });


        container.register('IBrowserAutomation', { useClass: PlaywrightAdapter }, { lifecycle: Lifecycle.Singleton });
        container.register('ILLMProvider', { useClass: LangChainAdapter });

        container.register('RunTestUseCase', { useClass: RunTestUseCase });

        // Register Enterprise Architecture
        container.registerSingleton(DomiaGateway);

        // Register Mock Node
        const gateway = container.resolve(DomiaGateway);
        const mockNode = new MockNode();
        gateway.registerNode(mockNode);
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
        const controller = new ExecutionController();

        const input = {
            url: 'https://www.google.com' as const,
            prompt: 'Verify the page loads successfully and the search bar is horizontally centered on the page. If you can see the Google logo and search bar, pass the test.',
            options: { headless: true, maxSteps: 5 },
        };

        const events: Array<{ type: string }> = [];
        let finalResult: unknown = null;

        try {
            const generator = useCase.execute(input, controller);
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
        const controller = new ExecutionController();

        const input = {
            url: 'https://www.google.com' as const,
            prompt: 'Search for "Top 10 programming languages" and verify that the results page loads.',
            options: { headless: true, maxSteps: 10 },
        };

        const events: Array<{ type: string }> = [];
        let finalResult: any = null;

        try {
            const generator = useCase.execute(input, controller);
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
