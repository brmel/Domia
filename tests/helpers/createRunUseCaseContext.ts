import { vi } from 'vitest';
import { ok, okAsync } from 'neverthrow';
import type { IStructuredAutomation, ILogger } from '@domain/ports';
import { RunUseCase } from '@application/use-cases/RunUseCase';
import { CheckpointCompactionService } from '@application/services/execution/CheckpointCompactionService';
import { ReplanningPolicyService } from '@application/services/execution/ReplanningPolicyService';
import { StepExecutionKernelService } from '@application/services/execution/StepExecutionKernelService';
import { RunBudgetPolicyService } from '@application/services/execution/RunBudgetPolicyService';
import { RuntimeReadinessPolicyService } from '@application/services/hardening/RuntimeReadinessPolicyService';
import { ReadinessGateService } from '@application/services/hardening/ReadinessGateService';



function createLifecycleManagerMock(runId = 'run-test') {
    return {
        initializeRun: vi.fn().mockResolvedValue(ok(runId)),
        finalizeRun: vi.fn().mockResolvedValue(undefined),
        failRun: vi.fn().mockResolvedValue(undefined),
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
        saveStep: vi.fn(() => okAsync(undefined)),
        getSteps: vi.fn(() => okAsync([])),
    };
}

function createTraceMock() {
    return {
        endTrace: vi.fn().mockResolvedValue(undefined),
    };
}

function createBrowserMock(): IStructuredAutomation {
    return {
        waitForReady: vi.fn().mockResolvedValue(undefined),
        navigateTo: vi.fn(() => okAsync(undefined)),
        wait: vi.fn(() => okAsync(undefined)),
        scroll: vi.fn(() => okAsync(undefined)),
        extractText: vi.fn(() => okAsync('text')),
    } as unknown as IStructuredAutomation;
}

function createSessionFactoryMock(automation: IStructuredAutomation) {
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

function createBudgetPolicyReal(logger: ILogger): RunBudgetPolicyService {
    return new RunBudgetPolicyService(logger);
}

function createReadinessPolicyReal(logger: ILogger): RuntimeReadinessPolicyService {
    const configService = {
        get: () => ({
            ai: { apiKey: 'test-key', model: 'test-model' },
            readiness: { mode: 'observe' },
        }),
    };
    return new RuntimeReadinessPolicyService(
        new ReadinessGateService(),
        configService as never,
        logger,
    );
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
    browser?: IStructuredAutomation;
    sessionFactory?: Record<string, unknown>;
    laneService?: Record<string, unknown>;
    durability?: Record<string, unknown>;
    /** Pass a mock to override; omit to use real RunBudgetPolicyService */
    budgetPolicy?: Record<string, unknown>;
    /** Pass a mock to override; omit to use real RuntimeReadinessPolicyService */
    readinessPolicy?: Record<string, unknown>;
    logger?: ILogger;
}

export interface UseCaseContext {
    useCase: RunUseCase;
    lifecycleManager: ReturnType<typeof createLifecycleManagerMock>;
    executor: ReturnType<typeof createExecutorMock>;
    persistence: ReturnType<typeof createPersistenceMock>;
    trace: ReturnType<typeof createTraceMock>;
    browser: IStructuredAutomation;
    releaseLane: ReturnType<typeof vi.fn>;
    durability: ReturnType<typeof createDurabilityMock>;
    budgetPolicy: RunBudgetPolicyService | Record<string, unknown>;
    readinessPolicy: RuntimeReadinessPolicyService | Record<string, unknown>;
    logger: ILogger;
}

export function createRunUseCaseContext(overrides: UseCaseContextOverrides = {}): UseCaseContext {
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
    const budgetPolicy = overrides.budgetPolicy ?? createBudgetPolicyReal(logger);
    const readinessPolicy = overrides.readinessPolicy ?? createReadinessPolicyReal(logger);

    const checkpointCompaction = new CheckpointCompactionService();
    const replanningPolicy = new ReplanningPolicyService(logger);

    const kernel = new StepExecutionKernelService(
        executor as unknown as never,
        persistence as unknown as never,
        durability as unknown as never,
        budgetPolicy as unknown as never,
    );

    const useCase = new RunUseCase(
        lifecycleManager as unknown as never,
        trace as unknown as never,
        sessionFactory as unknown as never,
        laneService as unknown as never,
        durability as unknown as never,
        budgetPolicy as unknown as never,
        checkpointCompaction as unknown as never,
        replanningPolicy as unknown as never,
        readinessPolicy as unknown as never,
        logger as unknown as never,
        kernel as unknown as never,
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
        readinessPolicy,
        logger,
    };
}
