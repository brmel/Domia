
import 'reflect-metadata';
import { container } from 'tsyringe';
import { registerCoreServices } from '../src/composition-root';
import { RunTestUseCase } from '../src/application/use-cases';
import { CancellationTokenSource } from '../src/domain/events';
import { IPersistenceAdapter, IBrowserAutomation, ILLMProvider, LLMContext } from '../src/domain/ports';
import { ResultAsync, okAsync } from 'neverthrow';
import { AgentAction, Url } from '../src/domain/value-objects';
import { ConsoleLogger } from '../src/infrastructure/adapters/logger/ConsoleLogger';
import { InteractionError, NavigationError, SnapshotError, CaptureError, LLMError } from '../src/domain/errors';

// Mock Browser Automation
class MockBrowserAdapter implements IBrowserAutomation {
    launch(_options?: any): ResultAsync<void, NavigationError> {
        console.log('[MockBrowser] Launching');
        return okAsync(undefined);
    }
    navigateTo(url: Url): ResultAsync<void, NavigationError> {
        console.log(`[MockBrowser] Navigating to ${url}`);
        return okAsync(undefined);
    }
    snapshot(): ResultAsync<import('../src/domain/value-objects').DOMSnapshot, SnapshotError> {
        return okAsync({
            url: 'https://example.com' as Url,
            title: 'Mock Page',
            html: '<html><body>Mock</body></html>',
            screenshot: Buffer.from('mock-screenshot'),
            timestamp: new Date().toISOString()
        } as any);
    }
    screenshot(): ResultAsync<{ data: Buffer; mimeType: string; timestamp: Date }, CaptureError> {
        return okAsync({
            data: Buffer.from('mock'),
            mimeType: 'image/png',
            timestamp: new Date()
        });
    }
    click(_selector: any): ResultAsync<void, InteractionError> { return okAsync(undefined); }
    type(_selector: any, _text: string): ResultAsync<void, InteractionError> { return okAsync(undefined); }
    scroll(_direction: 'up' | 'down'): ResultAsync<void, InteractionError> { return okAsync(undefined); }
    wait(_durationMs: number): ResultAsync<void, InteractionError> { return okAsync(undefined); }
    close(): Promise<void> {
        console.log('[MockBrowser] Closing');
        return Promise.resolve();
    }
    extractText(_selector: string): ResultAsync<string, InteractionError> { return okAsync('mock text'); }
    pressKey(_key: string): ResultAsync<void, InteractionError> { return okAsync(undefined); }
    getViewportSize(): Promise<{ width: number; height: number; }> { return Promise.resolve({ width: 1920, height: 1080 }); }
    waitForDOMStable(): Promise<void> { return Promise.resolve(); }

}

// Mock LLM Provider
class MockLLMProvider implements ILLMProvider {
    providerName = 'mock';
    private stepCount = 0;

    generateAction(_context: LLMContext): ResultAsync<AgentAction, LLMError> {
        this.stepCount++;
        if (this.stepCount === 1) {
            console.log('[MockLLM] Decided to WAIT');
            return okAsync({
                type: 'wait',
                durationMs: 100,
                thought: 'Thinking...'
            });
        }

        console.log('[MockLLM] Decided to PASS');
        return okAsync({
            type: 'pass',
            summary: 'Test passed successfully via mock',
            thought: 'Done'
        });
    }
}

async function main() {
    console.log('--- Verifying Database History Logic ---');

    // 1. Setup DI
    registerCoreServices();

    // Override with mocks
    container.register('IBrowserAutomation', { useClass: MockBrowserAdapter });
    // Force re-register simple logger to ensure visibility
    container.register('ILogger', { useClass: ConsoleLogger });
    // Override LLM
    container.register('ILLMProvider', { useClass: MockLLMProvider });

    const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
    const useCase = container.resolve(RunTestUseCase);

    // Clear DB first to start clean
    console.log('\n[Setup] Clearing database...');
    await persistence.clearHistory();

    const input = {
        url: 'https://example.com',
        prompt: 'Verify database persistence',
        options: { maxSteps: 5, headless: true }
    };

    console.log('\n[Action] Running Test Case...');
    const cancellation = new CancellationTokenSource();
    const generator = useCase.execute(input, cancellation.token);

    for await (const event of generator) {
        if (event.type === 'completed') {
            console.log(`[Result] Run completed. Success: ${event.success}`);
        }
    }

    // Verify DB
    console.log('\n[Verification] Checking Database...');
    const runsResult = await persistence.getTestRuns(10);
    if (runsResult.isErr()) {
        console.error('Failed to get runs', runsResult.error);
        process.exit(1);
    }

    const runs = runsResult.value;
    console.log(`Found ${runs.length} runs.`);

    if (runs.length === 0) {
        console.error('FAIL: No runs found in DB!');
        process.exit(1);
    }

    const latestRun = runs[0];
    if (!latestRun) {
        console.error('FAIL: Run is undefined!');
        process.exit(1);
    }
    console.log(`Latest Run ID: ${latestRun.id}, Status: ${latestRun.status}, Goal: ${latestRun.goal}`);

    // Verify steps
    const stepsResult = await persistence.getTestSteps(latestRun.id);
    if (stepsResult.isErr()) {
        console.error('Failed to get steps', stepsResult.error);
        process.exit(1);
    }
    const steps = stepsResult.value;
    console.log(`Found ${steps.length} steps for run ${latestRun.id}.`);

    if (steps.length === 0) {
        console.error('FAIL: No steps found for the run!');
        process.exit(1);
    }

    steps.forEach((step) => {
        console.log(`  Step ${step.stepNumber}: ${step.actionType}`);
    });

    // Clear history
    console.log('\n[Action] Clearing History...');
    const clearResult = await persistence.clearHistory();
    if (clearResult.isErr()) {
        console.error('Failed to clear history', clearResult.error);
        process.exit(1);
    }

    // Verify empty
    console.log('[Verification] Verifying Database is Empty...');
    const runsAfterClear = await persistence.getTestRuns(10);

    if (runsAfterClear.isOk()) {
        if (runsAfterClear.value.length === 0) {
            console.log('SUCCESS: Database is empty.');
        } else {
            console.error(`FAIL: Found ${runsAfterClear.value.length} runs after clear!`);
            process.exit(1);
        }
    } else {
        console.error('Failed to runs after clear', runsAfterClear.error);
        process.exit(1);
    }

}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
