import 'reflect-metadata';
import { container } from 'tsyringe';

import { PlaywrightAdapter } from './infrastructure/adapters/browser';
import { SQLiteAdapter, FileSystemAdapter } from './infrastructure/adapters/storage';
import { FileOutputAdapter } from './infrastructure/adapters/io';
import { VercelAIAdapter } from './infrastructure/adapters/llm';
import { GeminiAdapter } from './infrastructure/adapters/llm/GeminiAdapter';
import type { LLMConfig } from './infrastructure/adapters/llm';
import { RunTestUseCase } from './application/use-cases';
import { ConsoleLogger } from './infrastructure/adapters/logger/ConsoleLogger';
import { AgentViewService } from './infrastructure/electron/AgentViewService';

container.register('IBrowserAutomation', { useClass: PlaywrightAdapter });
container.register('ITestRunStorage', { useClass: SQLiteAdapter });
container.register('IArtifactStorage', { useClass: FileSystemAdapter });
container.register('ILogger', { useClass: ConsoleLogger });
container.register('IOutputPort', { useClass: FileOutputAdapter });
container.register(AgentViewService, { useClass: AgentViewService });

const defaultLLMConfig: LLMConfig = {
    provider: 'google',
    model: 'gemini-2.0-flash',
    apiKey: process.env['GOOGLE_API_KEY'] ?? process.env['GEMINI_API_KEY'] ?? '',
};
container.register('LLMConfig', { useValue: defaultLLMConfig });

container.register('ILLMProvider', {
    useFactory: (c) => {
        const config = c.resolve<LLMConfig>('LLMConfig');
        return config.provider === 'google'
            ? c.resolve(GeminiAdapter)
            : c.resolve(VercelAIAdapter);
    }
});

container.register('RunTestUseCase', { useClass: RunTestUseCase });

export { container };
