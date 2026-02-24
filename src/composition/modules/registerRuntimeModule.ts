import { container } from 'tsyringe';
import { TestRunLifecycleManager } from '@application/services/TestRunLifecycleManager';
import { InMemoryRunExecutionLaneService } from '@application/services/execution/RunExecutionLaneService';
import { RunDurabilityService } from '@application/services/execution/RunDurabilityService';
import { RunBudgetPolicyService } from '@application/services/execution/RunBudgetPolicyService';
import { RunLifecycleEngineService } from '@application/services/execution/RunLifecycleEngineService';
import { CheckpointCompactionService } from '@application/services/execution/CheckpointCompactionService';
import { RecoveryReadModelService } from '@application/services/execution/RecoveryReadModelService';
import { ManualRecoveryBootstrapService } from '@application/services/execution/ManualRecoveryBootstrapService';
import { RunRecoveryPolicyService } from '@application/services/execution/RunRecoveryPolicyService';
import { RecoveryReplayGuardService } from '@application/services/execution/RecoveryReplayGuardService';
import { RecoveryReplayIdempotencyService } from '@application/services/execution/RecoveryReplayIdempotencyService';
import { ReplanningPolicyService } from '@application/services/execution/ReplanningPolicyService';
import { BranchRollbackService } from '@application/services/execution/BranchRollbackService';
import { StepExecutionKernelService } from '@application/services/execution/StepExecutionKernelService';
import { PlanningCoordinator } from '@application/services/execution/coordinators/PlanningCoordinator';
import { RunCoordinator } from '@application/services/execution/coordinators/RunCoordinator';
import { ReplanningCoordinator } from '@application/services/execution/coordinators/ReplanningCoordinator';
import { ReadinessGateService } from '@application/services/hardening/ReadinessGateService';
import { RuntimeReadinessPolicyService } from '@application/services/hardening/RuntimeReadinessPolicyService';
import { TrajectoryExportService } from '@infrastructure/services/exporters/TrajectoryExportService';
import { ObjectiveCompletionPolicyService } from '@application/services/execution/ObjectiveCompletionPolicyService';


export function registerRuntimeModule(): void {
    container.registerSingleton(TestRunLifecycleManager);
    container.registerSingleton(InMemoryRunExecutionLaneService);
    container.register('IRunExecutionLaneService', { useToken: InMemoryRunExecutionLaneService });
    container.registerSingleton(RunDurabilityService);
    container.registerSingleton(RunBudgetPolicyService);
    container.registerSingleton(RunLifecycleEngineService);
    container.register('IRunLifecycleEngine', { useToken: RunLifecycleEngineService });
    container.registerSingleton(CheckpointCompactionService);
    container.registerSingleton(RecoveryReadModelService);
    container.registerSingleton(ManualRecoveryBootstrapService);
    container.registerSingleton(RunRecoveryPolicyService);
    container.registerSingleton(RecoveryReplayGuardService);
    container.registerSingleton(RecoveryReplayIdempotencyService);
    container.registerSingleton(ReplanningPolicyService);
    container.registerSingleton(BranchRollbackService);
    container.registerSingleton(StepExecutionKernelService);
    container.registerSingleton(PlanningCoordinator);
    container.registerSingleton(RunCoordinator);
    container.registerSingleton(ReplanningCoordinator);

    container.registerSingleton(ReadinessGateService);
    container.registerSingleton(RuntimeReadinessPolicyService);
    container.registerSingleton(TrajectoryExportService);
    container.registerSingleton(ObjectiveCompletionPolicyService);

}
