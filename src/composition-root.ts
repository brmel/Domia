import 'reflect-metadata';
import { container } from 'tsyringe';

import { PlaywrightAdapter } from './infrastructure/adapters/browser';
import { FileSystemAdapter } from './infrastructure/adapters/storage';

import type { LLMConfig } from '@domain/ports';
import { RunTestUseCase } from './application/use-cases';
import { ConsoleLogger } from './infrastructure/adapters/logger/ConsoleLogger';




import { LangChainAdapter } from './infrastructure/adapters/llm/LangChainAdapter';
import { ConfigService } from './infrastructure/config/ConfigService';
import { SQLiteAdapter } from './infrastructure/adapters/persistence/SQLiteAdapter';
import { ToolRegistry } from './application/registries/ToolRegistry';
import { ClickTool } from './application/tools/browser/ClickTool';
import { TypeTool } from './application/tools/browser/TypeTool';
import { ScrollTool } from './application/tools/browser/ScrollTool';
import { WaitTool } from './application/tools/browser/WaitTool';
import { NavigateTool } from './application/tools/browser/NavigateTool';
import { ExtractTool } from './application/tools/browser/ExtractTool';
import { PressKeyTool } from './application/tools/browser/PressKeyTool';

export function registerCoreServices() {
    // 1. Core Services (Config & Persistence)
    container.registerSingleton(ConfigService);
    container.register('IPersistenceAdapter', { useClass: SQLiteAdapter });

    container.register('IBrowserAutomation', { useClass: PlaywrightAdapter });
    container.register('IArtifactStorage', { useClass: FileSystemAdapter });
    container.register('ILogger', { useClass: ConsoleLogger });
    // AgentViewService is Electron-specific, so it's registered in electron/main.ts

    // IViewHost is NOT registered here anymore.
    // Electron/CLI entry points must register their own.

    // ConfigService now handles LLM config, but we keep this for backward compat if needed or refactor later
    // For now, let's keep LLMConfig as a simple value provider for adapters that might still use it directly
    // apart from ConfigService. 
    // actually, let's update LLMConfig to use ConfigService if possible, or just leave it for now.
    const defaultLLMConfig: LLMConfig = {
        provider: 'google',
        model: 'gemini-2.0-flash',
        apiKey: process.env['GOOGLE_API_KEY'] ?? process.env['GEMINI_API_KEY'] ?? '',
    };
    container.register('LLMConfig', { useValue: defaultLLMConfig });

    container.register('ILLMProvider', { useClass: LangChainAdapter });

    container.register('RunTestUseCase', { useClass: RunTestUseCase });

    // Tools
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(new ClickTool());
    toolRegistry.register(new TypeTool());
    toolRegistry.register(new ScrollTool());
    toolRegistry.register(new WaitTool());
    toolRegistry.register(new NavigateTool());
    toolRegistry.register(new ExtractTool());
    toolRegistry.register(new PressKeyTool());

    container.register(ToolRegistry, { useValue: toolRegistry });
}

export { container };
