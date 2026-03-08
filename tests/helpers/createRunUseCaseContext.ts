import { vi } from 'vitest';
import { ok, okAsync } from 'neverthrow';
import type { IStructuredAutomation, ILogger } from '@domain/ports';
import type { IRunRepository } from '@domain/ports/IRunRepository';
import type { ITraceService } from '@domain/ports/ITraceService';
import type { IStorageService } from '@domain/ports/IStorageService';
import type { IAgentRunner } from '@domain/ports/IAgentRunner';
import { RunUseCase } from '@application/use-cases/RunUseCase';
import { StepExecutionKernelService } from '@application/services/execution/StepExecutionKernelService';
import { RunBudgetPolicyService } from '@application/services/execution/RunBudgetPolicyService';
import { RunDurabilityService } from '@application/services/execution/RunDurabilityService';
import type { RunExecutionLaneService } from '@application/services/execution/RunExecutionLaneService';
import { RunLifecycleManager } from '@application/services/RunLifecycleManager';
import { PlatformSessionFactory } from '@application/services/platform/PlatformSessionFactory';
import { RuntimeReadinessPolicyService } from '@application/services/hardening/RuntimeReadinessPolicyService';
import { createMockLogger } from './createMockLogger';



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
        startTrace: vi.fn().mockResolvedValue(undefined),
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
        configService as never,
        logger,
    );
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
    const logger = overrides.logger ?? createMockLogger();
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

    const storageMock = {
        saveStepTrace: vi.fn().mockResolvedValue(undefined),
    };

    const kernel = new StepExecutionKernelService(
        executor as unknown as IAgentRunner,
        trace as unknown as ITraceService,
        storageMock as unknown as IStorageService,
        logger,
        persistence as unknown as IRunRepository,
        durability as unknown as RunDurabilityService,
        budgetPolicy as RunBudgetPolicyService,
    );

    const useCase = new RunUseCase(
        lifecycleManager as unknown as RunLifecycleManager,
        trace as unknown as ITraceService,
        sessionFactory as unknown as PlatformSessionFactory,
        laneService as unknown as RunExecutionLaneService,
        durability as unknown as RunDurabilityService,
        budgetPolicy as RunBudgetPolicyService,
        readinessPolicy as RuntimeReadinessPolicyService,
        logger,
        kernel,
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
