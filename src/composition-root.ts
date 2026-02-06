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
import type { LLMConfig } from './infrastructure/adapters/llm';

// Application use cases
import { RunTestUseCase } from './application/use-cases';

// Core Ports → Adapters
container.register('IBrowserAutomation', { useClass: PlaywrightAdapter });
container.register('ITestRunStorage', { useClass: SQLiteAdapter });
container.register('IArtifactStorage', { useClass: FileSystemAdapter });

// I/O Ports
container.register('IInputPort', { useClass: UIInputAdapter });
container.register('IOutputPort', { useClass: FileOutputAdapter });

// LLM Configuration (override via environment or registerInstance)
const defaultLLMConfig: LLMConfig = {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    apiKey: process.env['ANTHROPIC_API_KEY'] ?? '',
};
container.register('LLMConfig', { useValue: defaultLLMConfig });

// LLM Provider
container.register('ILLMProvider', { useClass: VercelAIAdapter });

// Use Cases
container.register('RunTestUseCase', { useClass: RunTestUseCase });

export { container };
