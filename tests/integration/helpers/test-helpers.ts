/**
 * Test Helpers for Integration Tests
 * 
 * Utilities for setting up and running integration tests with Domia agent
 */
import 'reflect-metadata';
import { container } from 'tsyringe';
import type { RunTestUseCase } from '../../../src/application/use-cases/RunTestUseCase';
import type { ExecutionController } from '../../../src/application/controllers/ExecutionController';
import type { PlatformConfig } from '../../../src/domain/types/PlatformConfig';

export interface TestExecutionOptions {
    headless?: boolean;
    maxSteps?: number;
    vision?: boolean;
    debugScreenshots?: boolean;
}

export interface TestResult {
    success: boolean;
    stepCount: number;
    duration: number;
    error: string | undefined;
    events: Array<{ type: string; data?: any }>;
}

/**
 * Execute a test using Domia agent
 */
export async function executeAgentTest(
    platformConfig: PlatformConfig,
    options: TestExecutionOptions = {}
): Promise<TestResult> {
    const useCase = container.resolve<RunTestUseCase>('RunTestUseCase');
    const controllerClass = (await import('../../../src/application/controllers/ExecutionController')).ExecutionController;
    const controller = new controllerClass() as ExecutionController;

    const input = {
        platformConfig,
        prompt: platformConfig.prompt,
        options: {
            headless: options.headless ?? true,
            maxSteps: options.maxSteps ?? 5,
            vision: options.vision ?? false,
            debugScreenshots: options.debugScreenshots ?? false,
        },
    };

    const events: Array<{ type: string; data?: any }> = [];
    let success = false;
    let stepCount = 0;
    let error: string | undefined;
    const startTime = Date.now();

    try {
        const generator = useCase.execute(input, controller);

        for await (const event of generator) {
            events.push({ type: event.type, data: event });
            
            if (event.type === 'acting' || event.type === 'observing') {
                stepCount++;
            }

            if (event.type === 'completed') {
                success = true;
                break;
            }

            if (event.type === 'error') {
                success = false;
                error = (event as any).error?.message || 'Unknown error';
                break;
            }
        }
    } catch (err) {
        success = false;
        error = err instanceof Error ? err.message : String(err);
    }

    const duration = Date.now() - startTime;

    return {
        success,
        stepCount,
        duration,
        error,
        events,
    };
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(
    condition: () => Promise<boolean> | boolean,
    timeoutMs: number = 30000,
    intervalMs: number = 1000
): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        if (await condition()) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    return false;
}

/**
 * Check if a port is open (for checking if Electron app is running with CDP)
 */
export async function isPortOpen(port: number): Promise<boolean> {
    try {
        const response = await fetch(`http://localhost:${port}/json/version`, {
            signal: AbortSignal.timeout(2000)
        });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Verify test passed within step limit
 */
export function verifyTestSuccess(
    result: TestResult,
    maxSteps: number,
    testName: string
): void {
    if (!result.success) {
        throw new Error(`Test "${testName}" failed: ${result.error || 'Unknown error'}`);
    }

    if (result.stepCount > maxSteps) {
        throw new Error(
            `Test "${testName}" exceeded step limit: ${result.stepCount} > ${maxSteps}`
        );
    }

    console.log(`✅ Test "${testName}" passed in ${result.stepCount}/${maxSteps} steps (${result.duration}ms)`);
}

/**
 * Get app executable paths based on platform
 */
export function getElectronAppPath(): string {
    const platform = process.platform;
    
    // Check build output directories
    if (platform === 'darwin') {
        return './release/mac/Auto-QA.app/Contents/MacOS/Auto-QA';
    } else if (platform === 'win32') {
        return './release/win-unpacked/Auto-QA.exe';
    } else {
        return './release/linux-unpacked/auto-qa';
    }
}

/**
 * Log test execution details
 */
export function logTestExecution(result: TestResult, testName: string): void {
    console.log(`\n📊 Test: ${testName}`);
    console.log(`   Status: ${result.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Steps: ${result.stepCount}`);
    console.log(`   Duration: ${result.duration}ms`);
    
    if (result.error) {
        console.log(`   Error: ${result.error}`);
    }

    console.log(`   Events: ${result.events.length}`);
    result.events.forEach((event, i) => {
        console.log(`      ${i + 1}. ${event.type}`);
    });
}
