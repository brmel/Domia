/**
 * Composition Root
 * 
 * This is where dependency injection is configured.
 * The composition root is at the entry point, outside all layers,
 * and is allowed to know about all layers.
 */
import 'reflect-metadata';
import { container } from 'tsyringe';

// Infrastructure adapters
import { PlaywrightAdapter } from './infrastructure/adapters/browser';
import { SQLiteAdapter, FileSystemAdapter } from './infrastructure/adapters/storage';
import { UIInputAdapter, FileOutputAdapter } from './infrastructure/adapters/io';
import { VercelAIAdapter } from './infrastructure/adapters/llm';
import { GeminiAdapter } from './infrastructure/adapters/llm/GeminiAdapter';
import type { LLMConfig } from './infrastructure/adapters/llm';

// Application use cases
import { RunTestUseCase } from './application/use-cases';

// Core Ports → Adapters
container.register('IBrowserAutomation', { useClass: PlaywrightAdapter });
container.register('ITestRunStorage', { useClass: SQLiteAdapter });
container.register('IArtifactStorage', { useClass: FileSystemAdapter });

// Logger
import { ConsoleLogger } from './infrastructure/adapters/logger/ConsoleLogger';
container.register('ILogger', { useClass: ConsoleLogger });

// I/O Ports
container.register('IInputPort', { useClass: UIInputAdapter });
container.register('IOutputPort', { useClass: FileOutputAdapter });

// LLM Configuration (override via environment or registerInstance)
const defaultLLMConfig: LLMConfig = {
    provider: 'google',
    model: 'gemini-2.0-flash',
    apiKey: process.env['GOOGLE_API_KEY'] ?? process.env['GEMINI_API_KEY'] ?? '',
};
container.register('LLMConfig', { useValue: defaultLLMConfig });

// LLM Provider - Use factory for conditional resolution based on config
container.register('ILLMProvider', {
    useFactory: (c) => {
        const config = c.resolve<LLMConfig>('LLMConfig');
        return config.provider === 'google'
            ? c.resolve(GeminiAdapter)
            : c.resolve(VercelAIAdapter);
    }
});

// Use Cases
container.register('RunTestUseCase', { useClass: RunTestUseCase });

export { container };
