import { container } from 'tsyringe';
import { ConfigService } from '@infrastructure/ConfigService';
import type { IConfigService } from '@domain/ports/IConfigService';
import { SqlJsConnection } from '@infrastructure/persistence/SqlJsConnection';
import { RunRepositoryAdapter } from '@infrastructure/persistence/RunRepositoryAdapter';
import { CheckpointRepositoryAdapter } from '@infrastructure/persistence/CheckpointRepositoryAdapter';
import { WorkflowRepositoryAdapter } from '@infrastructure/persistence/WorkflowRepositoryAdapter';
import { SQLiteAdapter } from '@infrastructure/persistence/SQLiteAdapter';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import { RunUseCase } from '@backend/runs';
import {
    WebDriverProvider,
    ElectronDriverProvider,
    AppDriverFactory,
} from '@infrastructure/drivers';
import { MobileDriverProvider } from '@infrastructure/appium/MobileDriverProvider';
import { PlatformSessionFactory } from '@backend/platform/PlatformSessionFactory';
import { RunLifecycleManager } from '@backend/runs/RunLifecycleManager';
import { InMemoryRunExecutionLaneService } from '@backend/runs/RunExecutionLaneService';
import { RunDurabilityService } from '@backend/runs/RunDurabilityService';
import { RunSuspensionService } from '@backend/runs/RunSuspensionService';
import { RunResumeService } from '@backend/runs/RunResumeService';
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
import { GeminiLlmFactory } from '@infrastructure/agent-runtime/adk/GeminiLlmFactory';
import { PerceptionPipeline } from '@infrastructure/perception/PerceptionPipeline';
import { VisionSensor } from '@infrastructure/perception/sensors/VisionSensor';
import { AriaSensor } from '@infrastructure/playwright/perception/AriaSensor';
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
import { OtelEventExporter } from '@infrastructure/observability/OtelEventExporter';
import { installAdkLoggerAdapter } from '@infrastructure/agent-runtime/adk/AdkLoggerAdapter';
import type { ILogger } from '@domain/ports/ILogger';
import { PluginsAppService } from '@backend/plugins/PluginsAppService';
import { RunReportingService } from '@backend/runs/RunReportingService';
import { RunReplayService } from '@backend/runs/RunReplayService';
import { RunHealthMonitorService } from '@backend/runs/RunHealthMonitorService';
import { SkillsAppService } from '@backend/skills/SkillsAppService';
import { SkillExtractionService } from '@backend/skills/SkillExtractionService';
import { SkillPlaybackService } from '@backend/skills/SkillPlaybackService';
import { SkillRunnerService } from '@infrastructure/skills/SkillRunnerService';
import { SkillRepositoryAdapter } from '@infrastructure/persistence/SkillRepositoryAdapter';
import { ShellCommandPolicyService } from '@infrastructure/shell/ShellCommandPolicyService';
import type { IShellPolicy } from '@domain/ports/IShellPolicy';

export class ContainerBuilder {
    registerCore(): this {
        container.registerSingleton('ILogger', ConsoleLogger);
        container.registerSingleton(ConfigService);
        container.register('IConfigService', { useToken: ConfigService });
        container.register('AiConfigProvider', { useFactory: (c) => () => c.resolve<IConfigService>('IConfigService').getAi() });
        container.register('PathsConfigProvider', { useFactory: (c) => () => c.resolve<IConfigService>('IConfigService').getPaths() });
        container.registerSingleton(SqlJsConnection);
        container.registerSingleton(RunRepositoryAdapter);
        container.registerSingleton(CheckpointRepositoryAdapter);
        container.registerSingleton(WorkflowRepositoryAdapter);
        container.register('IRunRepository', { useToken: RunRepositoryAdapter });
        container.register('ICheckpointRepository', { useToken: CheckpointRepositoryAdapter });
        container.register('IWorkflowRepository', { useToken: WorkflowRepositoryAdapter });
        container.registerSingleton(SQLiteAdapter);
        container.register('IPersistenceAdapter', { useToken: SQLiteAdapter });
        container.registerSingleton(EventBus);
        container.register('IEventBus', { useToken: EventBus });
        return this;
    }

    registerPlatform(): this {
        container.registerSingleton(BrowserPool);
        container.registerSingleton(PlatformSessionFactory);
        container.registerSingleton(WebDriverProvider);
        container.registerSingleton(ElectronDriverProvider);
        container.registerSingleton(MobileDriverProvider);
        container.registerSingleton(AppDriverFactory);
        container.register('IAppDriverFactory', { useToken: AppDriverFactory });
        return this;
    }

    registerRuntime(): this {
        container.registerSingleton(RunLifecycleManager);
        container.registerSingleton(InMemoryRunExecutionLaneService);
        container.register('IRunExecutionLaneService', { useToken: InMemoryRunExecutionLaneService });
        container.registerSingleton(RunDurabilityService);
        container.registerSingleton(RunSuspensionService);
        container.registerSingleton(RunResumeService);
        container.registerSingleton(RunBudgetPolicyService);
        container.registerSingleton(RunSessionService);
        container.registerSingleton(RunTerminalizationService);
        container.registerSingleton(RunPlanCoordinator);
        container.registerSingleton(RunControlGateService);
        container.registerSingleton(StepExecutionKernelService);
        container.registerSingleton(RuntimeReadinessPolicyService);
        container.registerSingleton(RunHealthMonitorService);
        container.register('IRunHealthMonitor', { useToken: RunHealthMonitorService });
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
        container.registerSingleton(GeminiLlmFactory);
        container.register('IAdkLlmFactory', { useToken: GeminiLlmFactory });
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
        container.registerSingleton(OtelEventExporter);
        return this;
    }

    installEventLogger(): this {
        container.resolve(EventLogger).install();
        container.resolve(OtelEventExporter).install();
        installAdkLoggerAdapter(container.resolve<ILogger>('ILogger'));
        return this;
    }

    registerUseCases(): this {
        container.register('RunUseCase', { useClass: RunUseCase });
        container.registerSingleton(SettingsAppService);
        container.registerSingleton(PromptsAppService);
        container.registerSingleton(RunQueries);
        container.registerSingleton(WorkflowQueries);
        container.registerSingleton(PluginsAppService);
        container.registerSingleton(RunReplayService);
        container.registerSingleton(SkillRepositoryAdapter);
        container.register('ISkillRepository', { useToken: SkillRepositoryAdapter });
        container.registerSingleton(SkillsAppService);
        container.registerSingleton(SkillExtractionService);
        container.registerSingleton(SkillRunnerService);
        container.register('ISkillPlayback', { useToken: SkillRunnerService });
        container.register('SkillShellExecutor', { useToken: ShellExecutor });
        container.register<() => IShellPolicy>('IShellPolicyFactory', {
            useFactory: (c) => () => {
                const cfg = c.resolve<IConfigService>('IConfigService').get().plugins.shell;
                return new ShellCommandPolicyService(cfg.denyPatterns, cfg.allowedCwd);
            },
        });
        container.registerSingleton(SkillPlaybackService);
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
        factory.registerProvider(container.resolve(MobileDriverProvider));
        return this;
    }

    async loadPlugins(pluginDir?: string): Promise<this> {
        const loader = container.resolve(PluginLoader);
        await loader.loadAll(pluginDir);
        return this;
    }
}


