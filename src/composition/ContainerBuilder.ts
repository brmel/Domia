import { container } from 'tsyringe';
import { ConfigService } from '@infrastructure/config/ConfigService';
import { SQLiteAdapter } from '@infrastructure/persistence/SQLiteAdapter';
import { ConsoleLogger } from '@infrastructure/logger/ConsoleLogger';
import { RunUseCase } from '@application/use-cases';
import {
    WebDriverProvider,
    ElectronDriverProvider,
    AppDriverFactory,
} from '@infrastructure/drivers';
import { PlatformSessionFactory } from '@application/services/platform/PlatformSessionFactory';
import { RunLifecycleManager } from '@application/services/RunLifecycleManager';
import { InMemoryRunExecutionLaneService } from '@application/services/execution/RunExecutionLaneService';
import { RunDurabilityService } from '@application/services/execution/RunDurabilityService';
import { RunBudgetPolicyService } from '@application/services/execution/RunBudgetPolicyService';
import { CheckpointCompactionService } from '@application/services/execution/CheckpointCompactionService';
import { ReplanningPolicyService } from '@application/services/execution/ReplanningPolicyService';
import { StepExecutionKernelService } from '@application/services/execution/StepExecutionKernelService';
import { ObjectiveCompletionPolicyService } from '@application/services/execution/ObjectiveCompletionPolicyService';
import { RunCoordinator } from '@application/services/execution/coordinators/RunCoordinator';
import { ReadinessGateService } from '@application/services/hardening/ReadinessGateService';
import { RuntimeReadinessPolicyService } from '@application/services/hardening/RuntimeReadinessPolicyService';
import { WorkflowDefinitionService } from '@application/services/workflow/WorkflowDefinitionService';
import { WorkflowRunOrchestratorService } from '@application/services/workflow/WorkflowRunOrchestratorService';
import { WorkflowStepGovernanceService } from '@application/services/workflow/WorkflowStepGovernanceService';
import { WorkflowStepRunnerService } from '@application/services/workflow/WorkflowStepRunnerService';
import { WorkflowStepPolicyService } from '@application/services/workflow/WorkflowStepPolicyService';
import { PlatformCapabilityNegotiationService } from '@application/services/platform/PlatformCapabilityNegotiationService';
import { LlmRuntimeConfigResolver } from '@infrastructure/llm/LlmRuntimeConfigResolver';
import { AdkAgentRunner } from '@infrastructure/adk/AdkAgentRunner';
import { PerceptionPipeline } from '@infrastructure/perception/PerceptionPipeline';
import { VisionSensor } from '@infrastructure/perception/sensors/VisionSensor';
import { AriaSensor } from '@infrastructure/perception/sensors/AriaSensor';
import { BrowserPool } from '@infrastructure/playwright/BrowserPool';
import { PluginRegistry } from '@infrastructure/plugins/PluginRegistry';
import { PluginLoader } from '@infrastructure/plugins/PluginLoader';
import { PromptService } from '@infrastructure/prompts/PromptService';
import { FileSystemStorage } from '@infrastructure/storage/FileSystemStorage';
import { TraceService } from '@infrastructure/services/TraceService';
import { FileTraceExporter } from '@infrastructure/services/exporters/FileTraceExporter';
import { DebugExporter } from '@infrastructure/services/exporters/DebugExporter';
import type { IStorageService } from '@domain/ports/IStorageService';

export class ContainerBuilder {
    registerCore(): this {
        container.registerSingleton(ConfigService);
        container.register('IConfigService', { useToken: ConfigService });
        container.registerSingleton('IPersistenceAdapter', SQLiteAdapter);
        container.register('IRunRepository', { useToken: 'IPersistenceAdapter' });
        container.register('ICheckpointRepository', { useToken: 'IPersistenceAdapter' });
        container.register('IWorkflowRepository', { useToken: 'IPersistenceAdapter' });
        container.registerSingleton('ILogger', ConsoleLogger);
        return this;
    }

    registerPlatform(): this {
        container.registerSingleton(BrowserPool);
        container.registerSingleton(PlatformSessionFactory);
        container.registerSingleton(WebDriverProvider);
        container.registerSingleton(ElectronDriverProvider);
        container.registerSingleton(AppDriverFactory);
        container.register('IAppDriverFactory', { useToken: AppDriverFactory });
        return this;
    }

    registerRuntime(): this {
        container.registerSingleton(RunLifecycleManager);
        container.registerSingleton(InMemoryRunExecutionLaneService);
        container.register('IRunExecutionLaneService', { useToken: InMemoryRunExecutionLaneService });
        container.registerSingleton(RunDurabilityService);
        container.registerSingleton(RunBudgetPolicyService);
        container.registerSingleton(CheckpointCompactionService);
        container.registerSingleton(ReplanningPolicyService);
        container.registerSingleton(StepExecutionKernelService);
        container.registerSingleton(RunCoordinator);
        container.registerSingleton(ReadinessGateService);
        container.registerSingleton(RuntimeReadinessPolicyService);
        container.registerSingleton(ObjectiveCompletionPolicyService);
        return this;
    }

    registerWorkflow(): this {
        container.registerSingleton(WorkflowDefinitionService);
        container.registerSingleton(WorkflowStepPolicyService);
        container.registerSingleton(WorkflowStepGovernanceService);
        container.registerSingleton(WorkflowStepRunnerService);
        container.registerSingleton(WorkflowRunOrchestratorService);
        container.registerSingleton(PlatformCapabilityNegotiationService);
        return this;
    }

    registerLlm(): this {
        container.registerSingleton(LlmRuntimeConfigResolver);
        container.registerSingleton(PluginRegistry);
        container.registerSingleton(PluginLoader);
        container.registerSingleton(PromptService);
        container.register('IPromptService', { useToken: PromptService });
        container.registerSingleton('IAgentRunner', AdkAgentRunner);
        return this;
    }

    registerPerception(): this {
        container.registerSingleton(VisionSensor);
        container.registerSingleton(AriaSensor);
        container.register('IPerceptionPipeline', { useClass: PerceptionPipeline });
        return this;
    }

    registerObservability(): this {
        container.registerSingleton('IStorageService', FileSystemStorage);
        container.registerSingleton(TraceService);
        container.register('ITraceService', { useToken: TraceService });

        const traceService = container.resolve(TraceService);
        const storage = container.resolve<IStorageService>('IStorageService');

        if (process.env['DOMIA_VERBOSE'] === 'true') {
            traceService.addExporter(new FileTraceExporter(storage));
        }

        traceService.addExporter(new DebugExporter());
        return this;
    }

    registerUseCases(): this {
        container.register('RunUseCase', { useClass: RunUseCase });
        return this;
    }

    initializePlatformProviders(): this {
        const factory = container.resolve(AppDriverFactory);
        factory.registerProvider(container.resolve(WebDriverProvider));
        factory.registerProvider(container.resolve(ElectronDriverProvider));
        return this;
    }

    async loadPlugins(pluginDir?: string): Promise<this> {
        const loader = container.resolve(PluginLoader);
        await loader.loadAll(pluginDir);
        return this;
    }
}

export function configureVerboseTracing(): void {
    const traceService = container.resolve(TraceService);
    const storage = container.resolve<IStorageService>('IStorageService');
    traceService.addExporter(new FileTraceExporter(storage));
}
