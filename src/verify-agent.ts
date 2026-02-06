import 'reflect-metadata';
import 'dotenv/config';
import { container } from 'tsyringe';
import { RunTestUseCase } from './application/use-cases';
import { PlaywrightAdapter } from './infrastructure/adapters/browser';
import { GeminiAdapter } from './infrastructure/adapters/llm/GeminiAdapter';
import { ConsoleLogger } from './infrastructure/adapters/logger/ConsoleLogger';
import { FileSystemAdapter } from './infrastructure/adapters/storage';
import { FileOutputAdapter } from './infrastructure/adapters/io';
import { type LLMConfig } from './infrastructure/adapters/llm';

// Mock Input/Output/Storage for CLI
class MockInput {
    parse(raw: any) { return { isErr: () => false, value: raw } as any; }
}

class MockStorage {
    async create() { return { isOk: () => true, value: 1 } as any; }
    async update() { return { isOk: () => true } as any; }
    async get() { return { isOk: () => true } as any; }
    async saveStep() { return { isOk: () => true } as any; }
}

async function main() {
    console.log('🚀 Starting Verification Script...');

    // 1. Setup DI (Similar to composition-root.ts)
    container.register('IBrowserAutomation', { useClass: PlaywrightAdapter });
    container.register('ITestRunStorage', { useClass: MockStorage });
    container.register('IArtifactStorage', { useClass: FileSystemAdapter });
    container.register('IInputPort', { useClass: MockInput });
    container.register('IOutputPort', { useClass: FileOutputAdapter });
    container.register('ILogger', { useClass: ConsoleLogger });

    // LLM Config
    const config: LLMConfig = {
        provider: 'google',
        model: 'gemini-2.0-flash',
        apiKey: process.env['GOOGLE_API_KEY'] || '',
    };
    container.register('LLMConfig', { useValue: config });
    container.register('ILLMProvider', { useClass: GeminiAdapter });

    // Resolve Use Case
    const runTestUseCase = container.resolve(RunTestUseCase);

    // 2. Define Test Input
    const testInput = {
        url: 'https://google.com',
        prompt: 'Search for "OpenAI" and verify results appear.',
        options: {
            headless: true, // Run headless for CLI
            maxSteps: 5
        }
    };

    console.log(`\n🎯 Target: ${testInput.url}`);
    console.log(`📝 Goal: ${testInput.prompt}\n`);

    // 3. Execute
    const cancellation = { requested: false };
    const eventStream = runTestUseCase.execute(testInput, cancellation);

    for await (const event of eventStream) {
        // The centralized logger will handle printing details to stdout
        // We just consume the stream here to keep it running
        if (event.type === 'completed') {
            console.log('\n✅ Test Execution Finished');
            console.log(`Success: ${event.success}`);
            console.log(`Summary: ${event.summary}`);
        } else if (event.type === 'error') {
            console.error('\n❌ Test Error:', event.error);
        }
    }
}

main().catch(console.error);
