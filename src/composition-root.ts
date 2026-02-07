import 'reflect-metadata';
import { container } from 'tsyringe';

import { PlaywrightAdapter } from './infrastructure/adapters/browser';
import { FileSystemAdapter } from './infrastructure/adapters/storage';

import type { LLMConfig } from '@domain/ports';
import { RunTestUseCase } from './application/use-cases';
import { ConsoleLogger } from './infrastructure/adapters/logger/ConsoleLogger';




import { LangChainAdapter } from './infrastructure/adapters/llm/LangChainAdapter';

export function registerCoreServices() {
    container.register('IBrowserAutomation', { useClass: PlaywrightAdapter });
    container.register('IArtifactStorage', { useClass: FileSystemAdapter });
    container.register('ILogger', { useClass: ConsoleLogger });
    // AgentViewService is Electron-specific, so it's registered in electron/main.ts

    // IViewHost is NOT registered here anymore.
    // Electron/CLI entry points must register their own.

    const defaultLLMConfig: LLMConfig = {
        provider: 'google',
        model: 'gemini-2.0-flash',
        apiKey: process.env['GOOGLE_API_KEY'] ?? process.env['GEMINI_API_KEY'] ?? '',
    };
    container.register('LLMConfig', { useValue: defaultLLMConfig });

    container.register('ILLMProvider', { useClass: LangChainAdapter });

    container.register('RunTestUseCase', { useClass: RunTestUseCase });
}

export { container };
