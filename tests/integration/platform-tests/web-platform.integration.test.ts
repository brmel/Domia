/**
 * Integration Test: Web Platform
 * 
 * Tests Domia agent's ability to interact with web applications
 * using the Web platform configuration.
 * 
 * Test Case: Google.com Search Button Detection
 * - Platform: Web
 * - URL: google.com
 * - Objective: Verify search button appears
 * - Max Steps: 3
 * 
 * Run with: npm run test:integration -- web-platform
 * Requires: GOOGLE_API_KEY environment variable
 */
import 'dotenv/config';
import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { container, Lifecycle } from 'tsyringe';
import { okAsync, ResultAsync } from 'neverthrow';
import type { 
    IPersistenceAdapter, 
    LLMConfig, 
    IStorageService, 
    ITraceService 
} from '@domain/ports';
import { PlaywrightAdapter } from '@infrastructure/adapters/browser/PlaywrightAdapter';
import { LangChainAdapter } from '@infrastructure/adapters/llm/LangChainAdapter';
import { ConsoleLogger } from '@infrastructure/adapters/logger/ConsoleLogger';
import { RunTestUseCase } from '@application/use-cases';
import { AppDriverFactory } from '@infrastructure/adapters/drivers/AppDriverFactory';
import { WebDriver } from '@infrastructure/adapters/drivers/WebDriver';
import { ElectronDriver } from '@infrastructure/adapters/drivers/ElectronDriver';
import { ToolRegistry } from '@domain/tools/ToolRegistry';
import type { WebPlatformConfig } from '@domain/types/PlatformConfig';
import { PersistenceError } from '@domain/errors';
import { executeAgentTest, verifyTestSuccess, logTestExecution } from '../helpers/test-helpers';

// Mock implementations for testing
class MockTraceService implements ITraceService {
    startTrace() { return Promise.resolve(); }
    tracePerception() { return Promise.resolve(); }
    traceReasoning() { return Promise.resolve(); }
    endTrace() { return Promise.resolve(); }
    addExporter() { }
}

class MockViewHost {
    show() { }
    hide() { }
    async getCDPWebSocketURL() { throw new Error('Not implemented'); }
}

class MockPersistenceAdapter implements IPersistenceAdapter {
    saveCheckpoint(_runId: string, _state: any): ResultAsync<void, PersistenceError> {
        return okAsync(undefined);
    }
    getCheckpoint(_runId: string): ResultAsync<any, PersistenceError> {
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

describe('Web Platform Integration Tests', () => {
    let isSetupComplete = false;

    beforeAll(() => {
        // Skip if API key not available
        const apiKey = process.env['GOOGLE_API_KEY'] ?? process.env['GEMINI_API_KEY'];
        if (!apiKey) {
            console.log('⚠️  Skipping: GOOGLE_API_KEY not set');
            return;
        }

        // Configure LLM
        const config: LLMConfig = {
            provider: 'google',
            model: 'gemini-2.0-flash',
            apiKey
        };

        // Register core services
        container.register('LLMConfig', { useValue: config });
        container.register('ILogger', { useClass: ConsoleLogger });
        container.register('IViewHost', { useClass: MockViewHost });
        container.register('IPersistenceAdapter', { useClass: MockPersistenceAdapter });
        container.register('IStorageService', { useClass: MockStorageService });
        container.register('ITraceService', { useClass: MockTraceService });
        container.register('IBrowserAutomation', { useClass: PlaywrightAdapter }, { lifecycle: Lifecycle.Singleton });
        container.register('ILLMProvider', { useClass: LangChainAdapter });

        // Register drivers and factory
        container.registerSingleton('WebDriver', WebDriver);
        container.registerSingleton('ElectronDriver', ElectronDriver);
        container.registerSingleton(ToolRegistry);
        container.registerSingleton(AppDriverFactory);

        // Register use case
        container.register('RunTestUseCase', { useClass: RunTestUseCase });

        isSetupComplete = true;
    });

    afterAll(() => {
        container.reset();
    });

    describe('Test A: Google.com Search Button Detection', () => {
        it('should detect Google search button within 3 steps', async () => {
            // Skip if setup failed or no API key
            if (!isSetupComplete) {
                console.log('⏭️  Test skipped: Setup incomplete or API key missing');
                return;
            }

            const platformConfig: WebPlatformConfig = {
                platform: 'web',
                url: 'https://www.google.com',
                prompt: 'make sure that the search button appears'
            };

            console.log('\n🧪 Running Test A: Web Platform (Google.com)');
            console.log('   Platform: Web');
            console.log('   URL: google.com');
            console.log('   Objective: Detect search button');
            console.log('   Max Steps: 3');

            const result = await executeAgentTest(platformConfig, {
                headless: true,
                maxSteps: 3,
                vision: false,
                debugScreenshots: false
            });

            // Log execution details
            logTestExecution(result, 'Google Search Button Detection');

            // Verify success
            verifyTestSuccess(result, 3, 'Google Search Button Detection');

            // Assertions
            expect(result.success).toBe(true);
            expect(result.stepCount).toBeLessThanOrEqual(3);
            expect(result.error).toBeUndefined();
        }, 120000); // 2 minute timeout

        it('should complete with vision mode enabled', async () => {
            if (!isSetupComplete) {
                console.log('⏭️  Test skipped: Setup incomplete or API key missing');
                return;
            }

            const platformConfig: WebPlatformConfig = {
                platform: 'web',
                url: 'https://www.google.com',
                prompt: 'verify the search button is visible and centered'
            };

            console.log('\n🧪 Running Test A (Vision): Web Platform with Vision');

            const result = await executeAgentTest(platformConfig, {
                headless: true,
                maxSteps: 3,
                vision: true,
                debugScreenshots: true
            });

            logTestExecution(result, 'Google Search Button (Vision Mode)');

            // Vision mode might take slightly more steps due to screenshot analysis
            expect(result.success).toBe(true);
            expect(result.stepCount).toBeLessThanOrEqual(5);
        }, 180000);
    });

    describe('Extended Web Platform Tests', () => {
        it('should handle simple navigation tasks', async () => {
            if (!isSetupComplete) {
                console.log('⏭️  Test skipped: Setup incomplete or API key missing');
                return;
            }

            const platformConfig: WebPlatformConfig = {
                platform: 'web',
                url: 'https://www.example.com',
                prompt: 'verify the page loads and has a heading'
            };

            const result = await executeAgentTest(platformConfig, {
                headless: true,
                maxSteps: 3
            });

            logTestExecution(result, 'Example.com Navigation');

            expect(result.success).toBe(true);
            expect(result.stepCount).toBeLessThanOrEqual(3);
        }, 120000);
    });
});
