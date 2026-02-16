import 'reflect-metadata';
import { container } from 'tsyringe';

import { PlaywrightAdapter } from './infrastructure/adapters/browser';
import { WebDriver, ElectronDriver, AppDriverFactory } from './infrastructure/adapters/drivers';
import { ToolRegistry } from './domain/tools/ToolRegistry';
import { RunTestUseCase } from './application/use-cases';
import { ConsoleLogger } from './infrastructure/adapters/logger/ConsoleLogger';

import { LangChainAdapter } from './infrastructure/adapters/llm/LangChainAdapter';
import { LangChainToolCallingProvider } from './infrastructure/adapters/llm/LangChainToolCallingProvider';
import { LlmRuntimeConfigResolver } from './infrastructure/adapters/llm/LlmRuntimeConfigResolver';
import { LangChainModelFactory } from './infrastructure/adapters/llm/LangChainModelFactory';
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
import { TrajectoryExportService } from './infrastructure/services/exporters/TrajectoryExportService';
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
import { RecoveryReplayIdempotencyService } from './application/services/execution/RecoveryReplayIdempotencyService';
import { ReplanningPolicyService } from './application/services/execution/ReplanningPolicyService';
import { PlanningCoordinator } from './application/services/execution/coordinators/PlanningCoordinator';
import { RunBootstrapCoordinator } from './application/services/execution/coordinators/RunBootstrapCoordinator';
import { StepExecutionCoordinator } from './application/services/execution/coordinators/StepExecutionCoordinator';
import { ReplanningCoordinator } from './application/services/execution/coordinators/ReplanningCoordinator';
import { TerminalizationCoordinator } from './application/services/execution/coordinators/TerminalizationCoordinator';
import { TemporalObservationPolicyService } from './application/services/perception/TemporalObservationPolicyService';
import { TimelineContextAssembler } from './application/services/perception/TimelineContextAssembler';
import { TemporalContextSelectorService } from './application/services/perception/TemporalContextSelectorService';
import { TemporalPrivacyFilterService } from './application/services/perception/TemporalPrivacyFilterService';
import { TemporalPromptAssemblerService } from './application/services/perception/TemporalPromptAssemblerService';
import { SkillRegistryService } from './application/services/skills/SkillRegistryService';
import { SkillGovernanceService } from './application/services/skills/SkillGovernanceService';
import { SkillExecutorService } from './application/services/skills/SkillExecutorService';
import { PluginCapabilityPolicyService } from './application/services/plugins/PluginCapabilityPolicyService';
import { PluginGatewayService } from './application/services/plugins/PluginGatewayService';
import { PluginRegistryService } from './application/services/plugins/PluginRegistryService';
import { PluginExecutionAdapterRegistryService } from './application/services/plugins/PluginExecutionAdapterRegistryService';
import { PluginApprovalService } from './application/services/plugins/PluginApprovalService';
import { ReadinessGateService } from './application/services/hardening/ReadinessGateService';
import { RuntimeReadinessPolicyService } from './application/services/hardening/RuntimeReadinessPolicyService';
import { WorkflowExecutionService } from './application/services/workflow/WorkflowExecutionService';
import { WorkflowDefinitionService } from './application/services/workflow/WorkflowDefinitionService';
import { WorkflowRunOrchestratorService } from './application/services/workflow/WorkflowRunOrchestratorService';
import { WorkflowStepGovernanceService } from './application/services/workflow/WorkflowStepGovernanceService';
import { WorkflowStepRunnerService } from './application/services/workflow/WorkflowStepRunnerService';
import { WorkflowStepPolicyService } from './application/services/workflow/WorkflowStepPolicyService';

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
    container.registerSingleton(RecoveryReplayIdempotencyService);
    container.registerSingleton(ReplanningPolicyService);
    container.registerSingleton(PlanningCoordinator);
    container.registerSingleton(RunBootstrapCoordinator);
    container.registerSingleton(StepExecutionCoordinator);
    container.registerSingleton(ReplanningCoordinator);
    container.registerSingleton(TerminalizationCoordinator);
    container.registerSingleton(TemporalObservationPolicyService);
    container.registerSingleton(TimelineContextAssembler);
    container.registerSingleton(TemporalContextSelectorService);
    container.registerSingleton(TemporalPrivacyFilterService);
    container.registerSingleton(TemporalPromptAssemblerService);
    container.registerSingleton(SkillRegistryService);
    container.registerSingleton(SkillGovernanceService);
    container.registerSingleton(SkillExecutorService);
    container.registerSingleton(PluginRegistryService);
    container.registerSingleton(PluginCapabilityPolicyService);
    container.registerSingleton(PluginExecutionAdapterRegistryService);
    container.registerSingleton(PluginApprovalService);
    container.registerSingleton(PluginGatewayService);
    container.registerSingleton(ReadinessGateService);
    container.registerSingleton(RuntimeReadinessPolicyService);
    container.registerSingleton(WorkflowDefinitionService);
    container.registerSingleton(WorkflowStepPolicyService);
    container.registerSingleton(WorkflowStepGovernanceService);
    container.registerSingleton(WorkflowStepRunnerService);
    container.registerSingleton(WorkflowRunOrchestratorService);
    container.registerSingleton(WorkflowExecutionService);
    container.registerSingleton(TrajectoryExportService);
    container.registerSingleton(ActionToolMapper);
    container.registerSingleton(RegistryBackedToolExecutor);
    container.registerSingleton(DefaultToolPolicyService);
    container.register('IToolPolicyService', { useToken: DefaultToolPolicyService });
    container.register('IToolExecutor', { useToken: RegistryBackedToolExecutor });

    container.registerSingleton(LlmRuntimeConfigResolver);
    container.registerSingleton(LangChainModelFactory);
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
