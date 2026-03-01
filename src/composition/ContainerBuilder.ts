import { container } from 'tsyringe';

// ── Core ──
import { ConfigService } from '@infrastructure/config/ConfigService';
import { SQLiteAdapter } from '@infrastructure/persistence/SQLiteAdapter';
import { ConsoleLogger } from '@infrastructure/logger/ConsoleLogger';
import { RunUseCase } from '@application/use-cases';

// ── Platform ──
import {
    WebDriverProvider,
    ElectronDriverProvider,
    AndroidDriverProvider,
    IosDriverProvider,
    AppDriverFactory,
} from '@infrastructure/drivers';
import { PlatformSessionFactory } from '@application/services/platform/PlatformSessionFactory';

// ── Runtime / Execution ──
import { RunLifecycleManager } from '@application/services/RunLifecycleManager';
import { InMemoryRunExecutionLaneService } from '@application/services/execution/RunExecutionLaneService';
import { RunDurabilityService } from '@application/services/execution/RunDurabilityService';
import { RunBudgetPolicyService } from '@application/services/execution/RunBudgetPolicyService';
import { CheckpointCompactionService } from '@application/services/execution/CheckpointCompactionService';
import { RecoveryEligibilityService } from '@application/services/execution/RecoveryEligibilityService';
import { ManualRecoveryBootstrapService } from '@application/services/execution/ManualRecoveryBootstrapService';
import { RecoveryReplayService } from '@application/services/execution/RecoveryReplayService';
import { ReplanningPolicyService } from '@application/services/execution/ReplanningPolicyService';
import { BranchRollbackService } from '@application/services/execution/BranchRollbackService';
import { StepExecutionKernelService } from '@application/services/execution/StepExecutionKernelService';
import { ObjectiveCompletionPolicyService } from '@application/services/execution/ObjectiveCompletionPolicyService';
import { PlanningCoordinator } from '@application/services/execution/coordinators/PlanningCoordinator';
import { RunCoordinator } from '@application/services/execution/coordinators/RunCoordinator';
import { ReplanningCoordinator } from '@application/services/execution/coordinators/ReplanningCoordinator';
import { ReadinessGateService } from '@application/services/hardening/ReadinessGateService';
import { RuntimeReadinessPolicyService } from '@application/services/hardening/RuntimeReadinessPolicyService';

// ── Workflow ──
import { WorkflowDefinitionService } from '@application/services/workflow/WorkflowDefinitionService';
import { WorkflowRunOrchestratorService } from '@application/services/workflow/WorkflowRunOrchestratorService';
import { WorkflowStepGovernanceService } from '@application/services/workflow/WorkflowStepGovernanceService';
import { WorkflowStepRunnerService } from '@application/services/workflow/WorkflowStepRunnerService';
import { WorkflowStepPolicyService } from '@application/services/workflow/WorkflowStepPolicyService';
import { PlatformCapabilityNegotiationService } from '@application/services/platform/PlatformCapabilityNegotiationService';

// ── LLM ──
import { LlmRuntimeConfigResolver } from '@infrastructure/llm/LlmRuntimeConfigResolver';
import { AdkAgentRunner } from '@infrastructure/adk/AdkAgentRunner';

// ── Perception ──
import { PerceptionPipeline } from '@infrastructure/perception/PerceptionPipeline';
import { VisionSensor } from '@infrastructure/perception/sensors/VisionSensor';
import { DomSensor } from '@infrastructure/perception/sensors/DomSensor';
import { AriaSensor } from '@infrastructure/perception/sensors/AriaSensor';

// ── Observability ──
import { FileSystemStorage } from '@infrastructure/storage/FileSystemStorage';
import { TraceService } from '@infrastructure/services/TraceService';
import { FileTraceExporter } from '@infrastructure/services/exporters/FileTraceExporter';
import { DebugExporter } from '@infrastructure/services/exporters/DebugExporter';
import { TrajectoryExportService } from '@infrastructure/services/exporters/TrajectoryExportService';
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
        container.registerSingleton(RecoveryEligibilityService);
        container.registerSingleton(ManualRecoveryBootstrapService);
        container.registerSingleton(RecoveryReplayService);
        container.registerSingleton(ReplanningPolicyService);
        container.registerSingleton(BranchRollbackService);
        container.registerSingleton(StepExecutionKernelService);
        container.registerSingleton(PlanningCoordinator);
        container.registerSingleton(RunCoordinator);
        container.registerSingleton(ReplanningCoordinator);
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
        container.registerSingleton('IAgentRunner', AdkAgentRunner);
        return this;
    }

    registerPerception(): this {
        container.registerSingleton(VisionSensor);
        container.registerSingleton(DomSensor);
        container.registerSingleton(AriaSensor);
        container.register('IPerceptionPipeline', { useClass: PerceptionPipeline });
        return this;
    }

    registerObservability(): this {
        container.registerSingleton('IStorageService', FileSystemStorage);
        container.registerSingleton(TraceService);
        container.register('ITraceService', { useToken: TraceService });
        container.registerSingleton(TrajectoryExportService);

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
        factory.registerProvider(container.resolve(AndroidDriverProvider));
        factory.registerProvider(container.resolve(IosDriverProvider));
        return this;
    }
}

export function configureVerboseTracing(): void {
    const traceService = container.resolve(TraceService);
    const storage = container.resolve<IStorageService>('IStorageService');
    traceService.addExporter(new FileTraceExporter(storage));
}
