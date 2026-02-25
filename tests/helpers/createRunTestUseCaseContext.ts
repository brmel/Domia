import { vi } from 'vitest';
import { ok, okAsync } from 'neverthrow';
import type { IAppAutomation, ILogger } from '@domain/ports';
import { RunTestUseCase } from '@application/use-cases/RunTestUseCase';
import { RecoveryReadModelService } from '@application/services/execution/RecoveryReadModelService';
import { RunRecoveryPolicyService } from '@application/services/execution/RunRecoveryPolicyService';
import { CheckpointCompactionService } from '@application/services/execution/CheckpointCompactionService';
import { ManualRecoveryBootstrapService } from '@application/services/execution/ManualRecoveryBootstrapService';
import { RecoveryReplayGuardService } from '@application/services/execution/RecoveryReplayGuardService';
import { RecoveryReplayIdempotencyService } from '@application/services/execution/RecoveryReplayIdempotencyService';
import { ReplanningPolicyService } from '@application/services/execution/ReplanningPolicyService';
import { StepExecutionKernelService } from '@application/services/execution/StepExecutionKernelService';



function createLifecycleManagerMock(runId = 'run-test') {
    return {
        initializeTestRun: vi.fn().mockResolvedValue(ok(runId)),
        finalizeTestRun: vi.fn().mockResolvedValue(undefined),
        failTestRun: vi.fn().mockResolvedValue(undefined),
    };
}

function createExecutorMock() {
    return {
        executeStep: vi.fn(async function* () {
            yield* [];
            return { success: true as const, terminal: 'pass' as const };
        }),
    };
}

function createPersistenceMock() {
    return {
        saveTestStep: vi.fn(() => okAsync(undefined)),
        getTestSteps: vi.fn(() => okAsync([])),
    };
}

function createTraceMock() {
    return {
        endTrace: vi.fn().mockResolvedValue(undefined),
    };
}

function createBrowserMock(): IAppAutomation {
    return {
        waitForDOMStable: vi.fn().mockResolvedValue(undefined),
        navigateTo: vi.fn(() => okAsync(undefined)),
        wait: vi.fn(() => okAsync(undefined)),
        scroll: vi.fn(() => okAsync(undefined)),
        extractText: vi.fn(() => okAsync('text')),
    } as unknown as IAppAutomation;
}

function createSessionFactoryMock(automation: IAppAutomation) {
    return {
        createSession: vi.fn().mockResolvedValue({
            automation,
            shouldNavigate: false,
            dispose: vi.fn().mockResolvedValue(undefined),
        }),
    };
}

function createLaneServiceMock(releaseLane: ReturnType<typeof vi.fn>) {
    return {
        acquire: vi.fn().mockResolvedValue(releaseLane),
    };
}

function createDurabilityMock(checkpointRecords: readonly unknown[] = []) {
    return {
        transition: vi.fn((_: string, __: string, next: string) => next),
        checkpoint: vi.fn().mockResolvedValue(undefined),
        getCheckpointRecords: vi.fn().mockResolvedValue(checkpointRecords),
    };
}

function createBudgetPolicyMock() {
    return {
        resolveLimits: vi.fn().mockReturnValue({}),
        assess: vi.fn().mockReturnValue({ status: 'ok', exceeded: [] }),
        evaluate: vi.fn().mockReturnValue({ status: 'ok', exceeded: [] }),
        formatExceededMessage: vi.fn().mockReturnValue('Run budget exceeded'),
    };
}

function createReplayIdempotencyMock(): RecoveryReplayIdempotencyService {
    return {
        buildNodeReplayKey: vi.fn(({ runId, branchId, nodeId, actionSignature }: Record<string, string>) =>
            `${runId}:${branchId}:${nodeId}:${actionSignature}`),
        shouldExecute: vi.fn().mockResolvedValue(true),
        markExecuted: vi.fn().mockResolvedValue(undefined),
    } as unknown as RecoveryReplayIdempotencyService;
}

function createReadinessPolicyMock() {
    return { assess: vi.fn().mockReturnValue({ blocked: false, mode: 'observe' }) };
}

function createLoggerMock(): ILogger {
    return { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
}


export interface UseCaseContextOverrides {
    runId?: string;
    checkpointRecords?: readonly unknown[];
    lifecycleManager?: Record<string, unknown>;
    executor?: Record<string, unknown>;
    persistence?: Record<string, unknown>;
    trace?: Record<string, unknown>;
    browser?: IAppAutomation;
    sessionFactory?: Record<string, unknown>;
    laneService?: Record<string, unknown>;
    durability?: Record<string, unknown>;
    budgetPolicy?: Record<string, unknown>;
    replayIdempotency?: RecoveryReplayIdempotencyService;
    readinessPolicy?: Record<string, unknown>;
    logger?: ILogger;
}

export interface UseCaseContext {
    useCase: RunTestUseCase;
    lifecycleManager: ReturnType<typeof createLifecycleManagerMock>;
    executor: ReturnType<typeof createExecutorMock>;
    persistence: ReturnType<typeof createPersistenceMock>;
    trace: ReturnType<typeof createTraceMock>;
    browser: IAppAutomation;
    releaseLane: ReturnType<typeof vi.fn>;
    durability: ReturnType<typeof createDurabilityMock>;
    budgetPolicy: ReturnType<typeof createBudgetPolicyMock>;
    replayIdempotency: RecoveryReplayIdempotencyService;
    readinessPolicy: ReturnType<typeof createReadinessPolicyMock>;
    logger: ILogger;
}

export function createRunTestUseCaseContext(overrides: UseCaseContextOverrides = {}): UseCaseContext {
    const logger = overrides.logger ?? createLoggerMock();
    const releaseLane = vi.fn();
    const browser = overrides.browser ?? createBrowserMock();

    const lifecycleManager = { ...createLifecycleManagerMock(overrides.runId), ...overrides.lifecycleManager };
    const executor = { ...createExecutorMock(), ...overrides.executor };
    const persistence = { ...createPersistenceMock(), ...overrides.persistence };
    const trace = { ...createTraceMock(), ...overrides.trace };
    const sessionFactory = overrides.sessionFactory ?? createSessionFactoryMock(browser);
    const laneService = overrides.laneService ?? createLaneServiceMock(releaseLane);
    const durability = { ...createDurabilityMock(overrides.checkpointRecords), ...overrides.durability };
    const budgetPolicy = { ...createBudgetPolicyMock(), ...overrides.budgetPolicy };
    const replayIdempotency = overrides.replayIdempotency ?? createReplayIdempotencyMock();
    const readinessPolicy = { ...createReadinessPolicyMock(), ...overrides.readinessPolicy };

    const checkpointCompaction = new CheckpointCompactionService();
    const recoveryReadModel = new RecoveryReadModelService();
    const recoveryBootstrap = new ManualRecoveryBootstrapService();
    const recoveryPolicy = new RunRecoveryPolicyService();
    const recoveryReplayGuard = new RecoveryReplayGuardService();
    const replanningPolicy = new ReplanningPolicyService(logger);

    const kernel = new StepExecutionKernelService(
        executor as unknown as never,
        persistence as unknown as never,
        durability as unknown as never,
        budgetPolicy as unknown as never,
    );

    const useCase = new RunTestUseCase(
        lifecycleManager as unknown as never,
        trace as unknown as never,
        sessionFactory as unknown as never,
        laneService as unknown as never,
        durability as unknown as never,
        budgetPolicy as unknown as never,
        checkpointCompaction as unknown as never,
        recoveryReadModel as unknown as never,
        recoveryBootstrap as unknown as never,
        recoveryPolicy as unknown as never,
        recoveryReplayGuard as unknown as never,
        replayIdempotency as unknown as never,
        replanningPolicy as unknown as never,
        readinessPolicy as unknown as never,
        logger as unknown as never,
        kernel as unknown as never,
        persistence as unknown as never,
    );

    return {
        useCase,
        lifecycleManager,
        executor,
        persistence,
        trace,
        browser,
        releaseLane,
        durability,
        budgetPolicy,
        replayIdempotency,
        readinessPolicy,
        logger,
    };
}
