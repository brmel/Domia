import 'reflect-metadata';
import { container } from 'tsyringe';

import { PlaywrightAdapter } from './infrastructure/adapters/browser';
import { FileSystemAdapter } from './infrastructure/adapters/storage';
import { VercelAIAdapter } from './infrastructure/adapters/llm';
import type { LLMConfig } from '@domain/ports';
import { RunTestUseCase } from './application/use-cases';
import { ConsoleLogger } from './infrastructure/adapters/logger/ConsoleLogger';
import { AgentViewService } from './infrastructure/electron/AgentViewService';

import { ElectronViewHost } from './infrastructure/adapters/view/ElectronViewHost';

container.register('IBrowserAutomation', { useClass: PlaywrightAdapter });
container.register('IArtifactStorage', { useClass: FileSystemAdapter });
container.register('ILogger', { useClass: ConsoleLogger });
container.register(AgentViewService, { useClass: AgentViewService });
container.register('IViewHost', { useClass: ElectronViewHost });

const defaultLLMConfig: LLMConfig = {
    provider: 'google',
    model: 'gemini-2.0-flash',
    apiKey: process.env['GOOGLE_API_KEY'] ?? process.env['GEMINI_API_KEY'] ?? '',
};
container.register('LLMConfig', { useValue: defaultLLMConfig });

import { LangChainAdapter } from './infrastructure/adapters/llm/LangChainAdapter';

container.register('ILLMProvider', {
    useFactory: (c) => {
        const config = c.resolve<LLMConfig>('LLMConfig');
        return config.provider === 'google'
            ? c.resolve(LangChainAdapter)
            : c.resolve(VercelAIAdapter);
    }
});

container.register('RunTestUseCase', { useClass: RunTestUseCase });

export { container };
