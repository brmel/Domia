import 'reflect-metadata';
import { container } from 'tsyringe';

import { PlaywrightAdapter } from './infrastructure/adapters/browser';
import { WebDriver, ElectronDriver, AppDriverFactory } from './infrastructure/adapters/drivers';
import { ToolRegistry } from './domain/tools/ToolRegistry';
import type { LLMConfig } from '@domain/ports';
import { RunTestUseCase } from './application/use-cases';
import { ConsoleLogger } from './infrastructure/adapters/logger/ConsoleLogger';

import { LangChainAdapter } from './infrastructure/adapters/llm/LangChainAdapter';
import { LangChainToolCallingProvider } from './infrastructure/adapters/llm/LangChainToolCallingProvider';
import { ConfigService } from './infrastructure/config/ConfigService';
import { SQLiteAdapter } from './infrastructure/adapters/persistence/SQLiteAdapter';
import { TestRunLifecycleManager } from './application/services/TestRunLifecycleManager';

import { PerceptionPipeline } from './infrastructure/perception/PerceptionPipeline';
import { VisionSensor } from './infrastructure/perception/sensors/VisionSensor';
import { DomSensor } from './infrastructure/perception/sensors/DomSensor';
import { AriaSensor } from './infrastructure/perception/sensors/AriaSensor';
import { FileSystemStorage } from './infrastructure/storage/FileSystemStorage';
import { TraceService } from './infrastructure/services/TraceService';
import { FileTraceExporter } from './infrastructure/services/exporters/FileTraceExporter';
import { DebugExporter } from './infrastructure/services/exporters/DebugExporter';
import { BrowserActionToolExecutor } from './application/services/tooling/BrowserActionToolExecutor';
import { RegistryBackedToolExecutor } from './application/services/tooling/RegistryBackedToolExecutor';
import { DefaultToolPolicyService } from './application/services/tooling/ToolPolicyService';
import { ActionToolMapper } from './shared/tooling/ActionToolMapper';
import { InMemoryRunExecutionLaneService } from './application/services/execution/RunExecutionLaneService';
import { RunDurabilityService } from './application/services/execution/RunDurabilityService';
import { RunBudgetPolicyService } from './application/services/execution/RunBudgetPolicyService';
import { CheckpointCompactionService } from './application/services/execution/CheckpointCompactionService';
import { RecoveryReadModelService } from './application/services/execution/RecoveryReadModelService';
import { ManualRecoveryBootstrapService } from './application/services/execution/ManualRecoveryBootstrapService';
import { RunRecoveryPolicyService } from './application/services/execution/RunRecoveryPolicyService';
import { RecoveryReplayGuardService } from './application/services/execution/RecoveryReplayGuardService';
import { ReplanningPolicyService } from './application/services/execution/ReplanningPolicyService';
import { TemporalObservationPolicyService } from './application/services/perception/TemporalObservationPolicyService';
import { TimelineContextAssembler } from './application/services/perception/TimelineContextAssembler';
import { SkillRegistryService } from './application/services/skills/SkillRegistryService';
import { SkillGovernanceService } from './application/services/skills/SkillGovernanceService';
import { PluginCapabilityPolicyService } from './application/services/plugins/PluginCapabilityPolicyService';
import { PluginGatewayService } from './application/services/plugins/PluginGatewayService';
import { PluginRegistryService } from './application/services/plugins/PluginRegistryService';
import { ReadinessGateService } from './application/services/hardening/ReadinessGateService';
import { RuntimeReadinessPolicyService } from './application/services/hardening/RuntimeReadinessPolicyService';

export function registerCoreServices(): void {
    // 1. Core Services (Config & Persistence)
    container.registerSingleton(ConfigService);
    container.register('IConfigService', { useToken: ConfigService });
    container.registerSingleton('IPersistenceAdapter', SQLiteAdapter);

    // Browser / Driver Automation
    container.registerSingleton(PlaywrightAdapter);

    // New App Driver Architecture
    container.registerSingleton(WebDriver);
    container.registerSingleton(ElectronDriver);
    container.registerSingleton(AppDriverFactory);
    container.registerSingleton(ToolRegistry);
    
    // Default app driver binding
    container.register('IAppDriver', { useToken: WebDriver });

    container.registerSingleton('ILogger', ConsoleLogger);

    // Decoupled Helper Services
    container.registerSingleton(TestRunLifecycleManager);
    container.registerSingleton(InMemoryRunExecutionLaneService);
    container.register('IRunExecutionLaneService', { useToken: InMemoryRunExecutionLaneService });
    container.registerSingleton(RunDurabilityService);
    container.registerSingleton(RunBudgetPolicyService);
    container.registerSingleton(CheckpointCompactionService);
    container.registerSingleton(RecoveryReadModelService);
    container.registerSingleton(ManualRecoveryBootstrapService);
    container.registerSingleton(RunRecoveryPolicyService);
    container.registerSingleton(RecoveryReplayGuardService);
    container.registerSingleton(ReplanningPolicyService);
    container.registerSingleton(TemporalObservationPolicyService);
    container.registerSingleton(TimelineContextAssembler);
    container.registerSingleton(SkillRegistryService);
    container.registerSingleton(SkillGovernanceService);
    container.registerSingleton(PluginRegistryService);
    container.registerSingleton(PluginCapabilityPolicyService);
    container.registerSingleton(PluginGatewayService);
    container.registerSingleton(ReadinessGateService);
    container.registerSingleton(RuntimeReadinessPolicyService);
    container.registerSingleton(ActionToolMapper);
    container.registerSingleton(BrowserActionToolExecutor);
    container.registerSingleton(RegistryBackedToolExecutor);
    container.registerSingleton(DefaultToolPolicyService);
    container.register('IToolPolicyService', { useToken: DefaultToolPolicyService });
    container.register('IToolExecutor', { useToken: RegistryBackedToolExecutor });

    // LLM Configuration
    const defaultLLMConfig: LLMConfig = {
        provider: 'google',
        model: 'gemini-2.0-flash',
        apiKey: process.env['GOOGLE_API_KEY'] ?? process.env['GEMINI_API_KEY'] ?? '',
    };
    container.register('LLMConfig', { useValue: defaultLLMConfig });

    container.register('IToolCallingProvider', { useClass: LangChainToolCallingProvider });
    container.register('ILLMProvider', { useClass: LangChainAdapter });
    container.register('RunTestUseCase', { useClass: RunTestUseCase });

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

}

export { container };
