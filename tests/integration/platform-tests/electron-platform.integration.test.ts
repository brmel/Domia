/**
 * Integration Test: Electron Platform
 * 
 * Tests Domia agent's ability to interact with Electron applications
 * using both CDP and Executable connection modes.
 * 
 * Test Cases:
 * B1: CDP Mode - Connect to running Domia app
 * B2: Executable Mode - Launch Domia app from executable
 * 
 * Run with: npm run test:integration -- electron-platform
 * 
 * Prerequisites:
 * - GOOGLE_API_KEY environment variable
 * - For CDP test: Domia app running with --remote-debugging-port=9222
 * - For Executable test: Domia app built (npm run build)
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
import type { ElectronPlatformConfig } from '@domain/types/PlatformConfig';
import { PersistenceError } from '@domain/errors';
import { 
    executeAgentTest, 
    verifyTestSuccess, 
    logTestExecution,
    isPortOpen,
    getElectronAppPath
} from '../helpers/test-helpers';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Mock implementations
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

describe('Electron Platform Integration Tests', () => {
    let isSetupComplete = false;

    beforeAll(() => {
        const apiKey = process.env['GOOGLE_API_KEY'] ?? process.env['GEMINI_API_KEY'];
        if (!apiKey) {
            console.log('⚠️  Skipping: GOOGLE_API_KEY not set');
            return;
        }

        const config: LLMConfig = {
            provider: 'google',
            model: 'gemini-2.0-flash',
            apiKey
        };

        container.register('LLMConfig', { useValue: config });
        container.register('ILogger', { useClass: ConsoleLogger });
        container.register('IViewHost', { useClass: MockViewHost });
        container.register('IPersistenceAdapter', { useClass: MockPersistenceAdapter });
        container.register('IStorageService', { useClass: MockStorageService });
        container.register('ITraceService', { useClass: MockTraceService });
        container.register('IBrowserAutomation', { useClass: PlaywrightAdapter }, { lifecycle: Lifecycle.Singleton });
        container.register('ILLMProvider', { useClass: LangChainAdapter });

        container.registerSingleton('WebDriver', WebDriver);
        container.registerSingleton('ElectronDriver', ElectronDriver);
        container.registerSingleton(ToolRegistry);
        container.registerSingleton(AppDriverFactory);
        container.register('RunTestUseCase', { useClass: RunTestUseCase });

        isSetupComplete = true;
    });

    afterAll(() => {
        container.reset();
    });

    describe('Test B1: Electron CDP Mode', () => {
        it('should connect to Electron app via CDP and find "Start Agent" button', async () => {
            if (!isSetupComplete) {
                console.log('⏭️  Test skipped: Setup incomplete or API key missing');
                return;
            }

            // Check if Electron app is running with CDP enabled
            const isCDPAvailable = await isPortOpen(9222);
            
            if (!isCDPAvailable) {
                console.log('⚠️  Skipping CDP test: No Electron app running on port 9222');
                console.log('   To run this test:');
                console.log('   1. Start Domia app: npm run dev');
                console.log('   2. Or launch built app with: your-app --remote-debugging-port=9222');
                return;
            }

            const platformConfig: ElectronPlatformConfig = {
                platform: 'electron',
                connection: {
                    type: 'cdp',
                    cdpUrl: 'http://localhost:9222',
                    windowTitle: 'Auto-QA' // Target Domia app window
                },
                prompt: 'make sure we have the button start agent appearing'
            };

            console.log('\n🧪 Running Test B1: Electron Platform (CDP Mode)');
            console.log('   Platform: Electron');
            console.log('   Connection: CDP (localhost:9222)');
            console.log('   Objective: Find "Start Agent" button');
            console.log('   Max Steps: 5');

            const result = await executeAgentTest(platformConfig, {
                headless: false, // Electron apps don't use headless
                maxSteps: 5,
                vision: false,
                debugScreenshots: false
            });

            logTestExecution(result, 'Electron CDP - Start Agent Button');

            verifyTestSuccess(result, 5, 'Electron CDP Test');

            expect(result.success).toBe(true);
            expect(result.stepCount).toBeLessThanOrEqual(5);
            expect(result.error).toBeUndefined();
        }, 180000); // 3 minute timeout

        it('should work with any Electron app (generic test)', async () => {
            if (!isSetupComplete) {
                console.log('⏭️  Test skipped: Setup incomplete or API key missing');
                return;
            }

            const isCDPAvailable = await isPortOpen(9222);
            if (!isCDPAvailable) {
                console.log('⚠️  Skipping: No Electron app on port 9222');
                return;
            }

            const platformConfig: ElectronPlatformConfig = {
                platform: 'electron',
                connection: {
                    type: 'cdp',
                    cdpUrl: 'http://localhost:9222'
                },
                prompt: 'verify the application window is loaded and has interactive elements'
            };

            console.log('\n🧪 Running Test B1 (Generic): Any Electron App');

            const result = await executeAgentTest(platformConfig, {
                headless: false,
                maxSteps: 5
            });

            logTestExecution(result, 'Generic Electron App Verification');

            expect(result.success).toBe(true);
            expect(result.stepCount).toBeLessThanOrEqual(5);
        }, 180000);
    });

    describe('Test B2: Electron Executable Mode', () => {
        it('should launch Domia app from executable and find "Start Agent" button', async () => {
            if (!isSetupComplete) {
                console.log('⏭️  Test skipped: Setup incomplete or API key missing');
                return;
            }

            // Check if built app exists
            const appPath = getElectronAppPath();
            const appExists = existsSync(resolve(process.cwd(), appPath));

            if (!appExists) {
                console.log('⚠️  Skipping Executable test: App not built');
                console.log(`   Expected path: ${appPath}`);
                console.log('   To run this test:');
                console.log('   1. Build the app: npm run build');
                console.log('   2. Check the release directory');
                return;
            }

            const platformConfig: ElectronPlatformConfig = {
                platform: 'electron',
                connection: {
                    type: 'executable',
                    executablePath: appPath,
                    launchArgs: ['--remote-debugging-port=9222'],
                    windowTitle: 'Auto-QA'
                },
                prompt: 'make sure we have the button start agent appearing'
            };

            console.log('\n🧪 Running Test B2: Electron Platform (Executable Mode)');
            console.log('   Platform: Electron');
            console.log('   Connection: Executable');
            console.log(`   Path: ${appPath}`);
            console.log('   Objective: Find "Start Agent" button');
            console.log('   Max Steps: 5');

            const result = await executeAgentTest(platformConfig, {
                headless: false,
                maxSteps: 5,
                vision: false,
                debugScreenshots: false
            });

            logTestExecution(result, 'Electron Executable - Start Agent Button');

            verifyTestSuccess(result, 5, 'Electron Executable Test');

            expect(result.success).toBe(true);
            expect(result.stepCount).toBeLessThanOrEqual(5);
            expect(result.error).toBeUndefined();
        }, 180000);

        it('should work with custom executable path (configurable)', async () => {
            if (!isSetupComplete) {
                console.log('⏭️  Test skipped: Setup incomplete or API key missing');
                return;
            }

            // Use environment variable for custom app path (useful for CI/CD)
            const customAppPath = process.env['TEST_ELECTRON_APP_PATH'];
            
            if (!customAppPath) {
                console.log('⚠️  Skipping: TEST_ELECTRON_APP_PATH not set');
                console.log('   Set this variable to test with a custom Electron app');
                return;
            }

            if (!existsSync(customAppPath)) {
                console.log(`⚠️  Skipping: App not found at ${customAppPath}`);
                return;
            }

            const platformConfig: ElectronPlatformConfig = {
                platform: 'electron',
                connection: {
                    type: 'executable',
                    executablePath: customAppPath,
                    launchArgs: ['--remote-debugging-port=9222']
                },
                prompt: 'verify the application launches and is interactive'
            };

            console.log('\n🧪 Running Test B2 (Custom): Custom Electron App');
            console.log(`   Path: ${customAppPath}`);

            const result = await executeAgentTest(platformConfig, {
                headless: false,
                maxSteps: 5
            });

            logTestExecution(result, 'Custom Electron App Launch');

            expect(result.success).toBe(true);
        }, 180000);
    });

    describe('Electron Platform Feature Tests', () => {
        it('should handle multi-window scenarios', async () => {
            if (!isSetupComplete) {
                console.log('⏭️  Test skipped: Setup incomplete or API key missing');
                return;
            }

            const isCDPAvailable = await isPortOpen(9222);
            if (!isCDPAvailable) {
                console.log('⚠️  Skipping: No Electron app on port 9222');
                return;
            }

            const platformConfig: ElectronPlatformConfig = {
                platform: 'electron',
                connection: {
                    type: 'cdp',
                    cdpUrl: 'http://localhost:9222'
                },
                prompt: 'verify that windows can be accessed and main window is active'
            };

            const result = await executeAgentTest(platformConfig, {
                maxSteps: 5
            });

            expect(result.success).toBe(true);
        }, 180000);
    });
});
