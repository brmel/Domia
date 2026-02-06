/**
 * Infrastructure DI Container
 * 
 * Only registers infrastructure adapters.
 * Use cases are registered in the composition root (src/composition-root.ts).
 */
import 'reflect-metadata';
import { container } from 'tsyringe';
import { PlaywrightAdapter } from '../adapters/browser';
import { SQLiteAdapter, FileSystemAdapter } from '../adapters/storage';
import { UIInputAdapter, FileOutputAdapter } from '../adapters/io';
import { VercelAIAdapter } from '../adapters/llm';
import type { LLMConfig } from '../adapters/llm';

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

export { container };
