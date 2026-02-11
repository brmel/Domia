import 'reflect-metadata';
import { container } from 'tsyringe';

import { PlaywrightAdapter } from './infrastructure/adapters/browser';
import { WebDriver, ElectronDriver, AppDriverFactory } from './infrastructure/adapters/drivers';
import { ToolRegistry } from './domain/tools/ToolRegistry';
import type { LLMConfig } from '@domain/ports';
import { RunTestUseCase } from './application/use-cases';
import { ConsoleLogger } from './infrastructure/adapters/logger/ConsoleLogger';

import { LangChainAdapter } from './infrastructure/adapters/llm/LangChainAdapter';
import { ConfigService } from './infrastructure/config/ConfigService';
import { SQLiteAdapter } from './infrastructure/adapters/persistence/SQLiteAdapter';
import { TestRunLifecycleManager } from './application/services/TestRunLifecycleManager';

import { LocalBrowserNode } from './infrastructure/nodes/LocalBrowserNode';
import { DomiaGateway } from './application/gateway/DomiaGateway';

import { PerceptionPipeline } from './infrastructure/perception/PerceptionPipeline';
import { VisionSensor } from './infrastructure/perception/sensors/VisionSensor';
import { DomSensor } from './infrastructure/perception/sensors/DomSensor';
import { AriaSensor } from './infrastructure/perception/sensors/AriaSensor';
import { FileSystemStorage } from './infrastructure/storage/FileSystemStorage';
import { TraceService } from './infrastructure/services/TraceService';
import { FileTraceExporter } from './infrastructure/services/exporters/FileTraceExporter';
import { DebugExporter } from './infrastructure/services/exporters/DebugExporter';

export function registerCoreServices(): void {
    // 1. Core Services (Config & Persistence)
    container.registerSingleton(ConfigService);
    container.register('IConfigService', { useToken: ConfigService });
    container.registerSingleton('IPersistenceAdapter', SQLiteAdapter);

    // Browser / Driver Automation
    container.registerSingleton(PlaywrightAdapter);
    container.register('IBrowserAutomation', { useToken: PlaywrightAdapter }); // Legacy/Internal

    // New App Driver Architecture
    container.registerSingleton(WebDriver);
    container.registerSingleton(ElectronDriver);
    container.registerSingleton(AppDriverFactory);
    container.registerSingleton(ToolRegistry);
    
    // Default to WebDriver for backward compatibility
    // Use AppDriverFactory.createDriver() to switch platforms dynamically
    container.register('IAppDriver', { useToken: WebDriver });

    container.registerSingleton('ILogger', ConsoleLogger);

    // Decoupled Helper Services
    container.registerSingleton(TestRunLifecycleManager);

    // LLM Configuration
    const defaultLLMConfig: LLMConfig = {
        provider: 'google',
        model: 'gemini-2.0-flash',
        apiKey: process.env['GOOGLE_API_KEY'] ?? process.env['GEMINI_API_KEY'] ?? '',
    };
    container.register('LLMConfig', { useValue: defaultLLMConfig });

    container.register('ILLMProvider', { useClass: LangChainAdapter });
    container.register('RunTestUseCase', { useClass: RunTestUseCase });

    // Tools (Legacy - Removed)
    // const toolRegistry = new ToolRegistry();
    // ... removed execution logic is now in StepExecutor


    // Enterprise Architecture Services
    container.registerSingleton(LocalBrowserNode);
    container.registerSingleton(DomiaGateway);

    // Perception System
    container.registerSingleton(VisionSensor);
    container.registerSingleton(DomSensor);
    container.registerSingleton(AriaSensor);

    container.register('ISensor', { useToken: VisionSensor });
    container.register('ISensor', { useToken: DomSensor });
    container.register('ISensor', { useToken: AriaSensor });

    // Register PerceptionPipeline as IPerceptionPipeline
    container.register('IPerceptionPipeline', { useClass: PerceptionPipeline });

    // Storage & Trace Systems
    container.registerSingleton('IStorageService', FileSystemStorage);
    container.registerSingleton(TraceService);
    container.register('ITraceService', { useToken: TraceService });

    const traceService = container.resolve(TraceService);
    const storage = container.resolve<import('@domain/ports/IStorageService').IStorageService>('IStorageService');

    // Register Exporters based on config/env
    if (process.env['DOMIA_VERBOSE'] === 'true') {
        traceService.addExporter(new FileTraceExporter(storage));
    }

    // Always enable debug exporter (let the 'debug' package handle filtering via DEBUG env var)
    traceService.addExporter(new DebugExporter());

    // Auto-register local node
    const gateway = container.resolve(DomiaGateway);
    const localNode = container.resolve(LocalBrowserNode);
    gateway.registerNode(localNode);
}

export { container };
