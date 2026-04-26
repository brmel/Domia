import { container } from 'tsyringe';
import { ConfigService } from '@infrastructure/ConfigService';
import { SQLiteAdapter } from '@infrastructure/persistence/SQLiteAdapter';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import { RunUseCase } from '@backend/runs';
import {
    WebDriverProvider,
    ElectronDriverProvider,
    AppDriverFactory,
} from '@infrastructure/drivers';
import { PlatformSessionFactory } from '@backend/platform/PlatformSessionFactory';
import { RunLifecycleManager } from '@backend/runs/RunLifecycleManager';
import { InMemoryRunExecutionLaneService } from '@backend/runs/RunExecutionLaneService';
import { RunDurabilityService } from '@backend/runs/RunDurabilityService';
import { RunBudgetPolicyService } from '@backend/runs/RunBudgetPolicyService';
import { RunSessionService } from '@backend/runs/RunSessionService';
import { RunTerminalizationService } from '@backend/runs/RunTerminalizationService';
import { RunPlanCoordinator } from '@backend/runs/RunPlanCoordinator';
import { RunControlGateService } from '@backend/runs/RunControlGateService';
import { StepExecutionKernelService } from '@backend/runs/StepExecutionKernelService';
import { RuntimeReadinessPolicyService } from '@backend/policy/RuntimeReadinessPolicyService';
import { WorkflowDefinitionService } from '@backend/workflows/WorkflowDefinitionService';
import { WorkflowRunOrchestratorService } from '@backend/workflows/WorkflowRunOrchestratorService';
import { WorkflowStepGovernanceService } from '@backend/workflows/WorkflowStepGovernanceService';
import { WorkflowStepRunnerService } from '@backend/workflows/WorkflowStepRunnerService';
import { WorkflowStepPolicyService } from '@backend/workflows/WorkflowStepPolicyService';
import { SettingsAppService } from '@backend/settings/SettingsAppService';
import { PromptsAppService } from '@backend/prompts/PromptsAppService';
import { PlatformCapabilityNegotiationService } from '@backend/platform/PlatformCapabilityNegotiationService';
import { LlmRuntimeConfigResolver } from '@infrastructure/llm/LlmRuntimeConfigResolver';
import { AdkAgentRuntime } from '@infrastructure/agent-runtime/adk/AdkAgentRuntime';
import { PerceptionPipeline } from '@infrastructure/perception/PerceptionPipeline';
import { VisionSensor } from '@infrastructure/perception/sensors/VisionSensor';
import { AriaSensor } from '@infrastructure/perception/sensors/AriaSensor';
import { BrowserPool } from '@infrastructure/playwright/BrowserPool';
import { PluginRegistry } from '@infrastructure/plugins/PluginRegistry';
import { PluginLoader } from '@infrastructure/plugins/PluginLoader';
import { ShellExecutor } from '@infrastructure/shell/ShellExecutor';
import { PromptService } from '@infrastructure/prompts/PromptService';
import { FileSystemStorage } from '@infrastructure/FileSystemStorage';
import { TraceService } from '@infrastructure/services/TraceService';
import { ReportWriterService } from '@infrastructure/reporting/ReportWriterService';
import { JUnitXmlReportGenerator } from '@infrastructure/reporting/JUnitXmlReportGenerator';
import { HtmlReportGenerator } from '@infrastructure/reporting/HtmlReportGenerator';
import { EventBus } from '@backend/events/EventBus';
import { RunQueries } from '@backend/runs/RunQueries';
import { WorkflowQueries } from '@backend/workflows/WorkflowQueries';
import { EventLogger } from '@infrastructure/observability/EventLogger';
import { PluginsAppService } from '@backend/plugins/PluginsAppService';
import { RunReportingService } from '@backend/runs/RunReportingService';

export class ContainerBuilder {
    registerCore(): this {
        container.registerSingleton(ConfigService);
        container.register('IConfigService', { useToken: ConfigService });
        container.registerSingleton('IPersistenceAdapter', SQLiteAdapter);
        container.register('IRunRepository', { useToken: 'IPersistenceAdapter' });
        container.register('ICheckpointRepository', { useToken: 'IPersistenceAdapter' });
        container.register('IWorkflowRepository', { useToken: 'IPersistenceAdapter' });
        container.registerSingleton('ILogger', ConsoleLogger);
        container.registerSingleton(EventBus);
        container.register('IEventBus', { useToken: EventBus });
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
        container.registerSingleton(RunSessionService);
        container.registerSingleton(RunTerminalizationService);
        container.registerSingleton(RunPlanCoordinator);
        container.registerSingleton(RunControlGateService);
        container.registerSingleton(StepExecutionKernelService);
        container.registerSingleton(RuntimeReadinessPolicyService);
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
        container.register('IPluginRegistry', { useToken: PluginRegistry });
        container.registerSingleton(PluginLoader);
        container.registerSingleton(ShellExecutor);
        container.registerSingleton(PromptService);
        container.register('IPromptService', { useToken: PromptService });
        container.registerSingleton('IAgentRuntime', AdkAgentRuntime);
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
        container.registerSingleton(EventLogger);
        return this;
    }

    installEventLogger(): this {
        container.resolve(EventLogger).install();
        return this;
    }

    registerUseCases(): this {
        container.register('RunUseCase', { useClass: RunUseCase });
        container.registerSingleton(SettingsAppService);
        container.registerSingleton(PromptsAppService);
        container.registerSingleton(RunQueries);
        container.registerSingleton(WorkflowQueries);
        container.registerSingleton(PluginsAppService);
        return this;
    }

    registerReporting(): this {
        container.register('IReportGenerator:junit', { useClass: JUnitXmlReportGenerator });
        container.register('IReportGenerator:html', { useClass: HtmlReportGenerator });
        container.register(ReportWriterService, {
            useFactory: (c) => new ReportWriterService(
                c.resolve('IPersistenceAdapter'),
                [c.resolve('IReportGenerator:junit'), c.resolve('IReportGenerator:html')],
            ),
        });
        container.register('IRunReportWriter', { useToken: ReportWriterService });
        container.registerSingleton(RunReportingService);
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


