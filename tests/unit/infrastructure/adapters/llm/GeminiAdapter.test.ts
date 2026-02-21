import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { GeminiAdapter } from '@infrastructure/adapters/llm/GeminiAdapter';
import { ActionType } from '@domain/enums/ActionType';
import type {
    ILogger,
    IConfigService,
    IToolCallingProvider,
    LLMContext,
    LLMEvaluationContext,
    ToolCallingOutcome,
} from '@domain/ports';
import type { ActionToolMapper } from '@shared/tooling/ActionToolMapper';
import type { GeminiModelFactory } from '@infrastructure/adapters/llm/GeminiModelFactory';
import type { LlmRuntimeConfigResolver } from '@infrastructure/adapters/llm/LlmRuntimeConfigResolver';
import type { ToolCallingFailurePolicy } from '@infrastructure/adapters/llm/ToolCallingFailurePolicy';

function createLogger(): ILogger {
    return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function createConfigService(): IConfigService {
    return {
        get: vi.fn().mockReturnValue({
            ai: { provider: 'google', model: 'gemini-2.0-flash', visionEnabled: true, debugScreenshots: false },
            headless: true,
            viewport: { width: 1280, height: 720 },
            selectorEngine: { strategy: 'auto' },
            paths: { artifactsDir: './artifacts' },
            limits: { maxSteps: 20, delayBetweenSteps: 0, maxReplansPerRun: 3 },
        }),
        update: vi.fn(),
    } as unknown as IConfigService;
}

function createRuntimeConfig(): LlmRuntimeConfigResolver {
    return {
        resolve: vi.fn().mockReturnValue({
            provider: 'google',
            model: 'gemini-2.0-flash',
            apiKey: 'test-key',
        }),
    } as unknown as LlmRuntimeConfigResolver;
}

function createModelFactory(): GeminiModelFactory {
    return {
        describe: vi.fn().mockReturnValue('google/gemini-2.0-flash'),
        createPlanningModel: vi.fn().mockReturnValue({
            generateContent: vi.fn(),
        }),
    } as unknown as GeminiModelFactory;
}

function createToolCallingProvider(outcome?: ToolCallingOutcome): IToolCallingProvider {
    return {
        generateToolCallOutcome: vi.fn().mockResolvedValue(
            outcome ?? { ok: true, result: { name: 'mouse_click_left', args: { x: 100, y: 200, thought: 'click' } } }
        ),
        generateToolCall: vi.fn(),
    } as unknown as IToolCallingProvider;
}

function createActionToolMapper(): ActionToolMapper {
    return {
        getModelToolDefinitions: vi.fn().mockReturnValue([]),
        mapModelToolCallToAction: vi.fn().mockReturnValue({
            type: ActionType.MOUSE_CLICK_LEFT,
            x: 100,
            y: 200,
            thought: 'click button',
        }),
        getEvaluationToolDefinitions: vi.fn().mockReturnValue([]),
        mapModelToolCallToEvaluationDecision: vi.fn().mockReturnValue({
            decision: 'approve',
            summary: 'Step completed successfully',
            confidence: 0.95,
            evidence: ['Button was clicked'],
        }),
    } as unknown as ActionToolMapper;
}

function createFailurePolicy(): ToolCallingFailurePolicy {
    return {
        resolve: vi.fn().mockReturnValue({ type: 'fail', reason: 'test failure' }),
    } as unknown as ToolCallingFailurePolicy;
}

function makeContext(overrides: Partial<LLMContext> = {}): LLMContext {
    return {
        goal: 'click the submit button',
        currentUrl: 'https://example.com',
        pageTitle: 'Example',
        snapshot: {
            dom: '<button>Submit</button>',
            elements: [{
                id: 'e1',
                tag: 'button',
                text: 'Submit',
                role: 'button',
                attributes: {},
                boundingBox: { x: 100, y: 200, width: 80, height: 30 },
            }],
            rootElements: { html: {}, body: {} },
            screenshots: [],
        },
        previousActions: [],
        stepsRemaining: 5,
        viewport: { width: 1280, height: 720 },
        ...overrides,
    } as unknown as LLMContext;
}

function makeEvalContext(overrides: Partial<LLMEvaluationContext> = {}): LLMEvaluationContext {
    return {
        ...makeContext(),
        attemptedAction: { type: ActionType.MOUSE_CLICK_LEFT, x: 100, y: 200, thought: 'click' },
        executionOutcome: 'executed',
        ...overrides,
    } as unknown as LLMEvaluationContext;
}

function createAdapter(overrides: {
    logger?: ILogger;
    configService?: IConfigService;
    toolCallingProvider?: IToolCallingProvider;
    actionToolMapper?: ActionToolMapper;
    runtimeConfig?: LlmRuntimeConfigResolver;
    modelFactory?: GeminiModelFactory;
    failurePolicy?: ToolCallingFailurePolicy;
} = {}) {
    return new GeminiAdapter(
        overrides.logger ?? createLogger(),
        overrides.configService ?? createConfigService(),
        overrides.toolCallingProvider ?? createToolCallingProvider(),
        overrides.actionToolMapper ?? createActionToolMapper(),
        overrides.runtimeConfig ?? createRuntimeConfig(),
        overrides.modelFactory ?? createModelFactory(),
        overrides.failurePolicy ?? createFailurePolicy(),
    );
}

describe('GeminiAdapter', () => {
    describe('providerName', () => {
        it('delegates to modelFactory.describe with resolved config', () => {
            const modelFactory = createModelFactory();
            const runtimeConfig = createRuntimeConfig();
            const adapter = createAdapter({ modelFactory, runtimeConfig });

            expect(adapter.providerName).toBe('google/gemini-2.0-flash');
            expect(modelFactory.describe).toHaveBeenCalledWith(runtimeConfig.resolve());
        });
    });

    describe('generateAction', () => {
        it('returns action on successful tool call', async () => {
            const adapter = createAdapter();
            const result = await adapter.generateAction(makeContext());

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value.type).toBe(ActionType.MOUSE_CLICK_LEFT);
            }
        });

        it('retries on retryable failure and succeeds', async () => {
            const toolCallingProvider = createToolCallingProvider();
            const failurePolicy = createFailurePolicy();
            const actionToolMapper = createActionToolMapper();

            // First call fails, second call succeeds
            (toolCallingProvider.generateToolCallOutcome as ReturnType<typeof vi.fn>)
                .mockResolvedValueOnce({
                    ok: false,
                    failure: { code: 'provider_transient', message: 'rate limited', recoverable: true, retryable: true },
                })
                .mockResolvedValueOnce({
                    ok: true,
                    result: { name: 'pass', args: { thought: 'done' } },
                });

            (failurePolicy.resolve as ReturnType<typeof vi.fn>).mockReturnValue({ type: 'retry' });

            const adapter = createAdapter({ toolCallingProvider, failurePolicy, actionToolMapper });
            const result = await adapter.generateAction(makeContext());

            expect(result.isOk()).toBe(true);
            expect(toolCallingProvider.generateToolCallOutcome).toHaveBeenCalledTimes(2);
        });

        it('retries with correction context when policy says retry_with_correction', async () => {
            const toolCallingProvider = createToolCallingProvider();
            const failurePolicy = createFailurePolicy();
            const actionToolMapper = createActionToolMapper();

            (toolCallingProvider.generateToolCallOutcome as ReturnType<typeof vi.fn>)
                .mockResolvedValueOnce({
                    ok: false,
                    failure: { code: 'invalid_tool_args', message: 'bad args', recoverable: true, retryable: true },
                })
                .mockResolvedValueOnce({
                    ok: true,
                    result: { name: 'pass', args: { thought: 'fixed' } },
                });

            (failurePolicy.resolve as ReturnType<typeof vi.fn>).mockReturnValue({
                type: 'retry_with_correction',
                reason: 'bad args: please fix',
            });

            const adapter = createAdapter({ toolCallingProvider, failurePolicy, actionToolMapper });
            const result = await adapter.generateAction(makeContext());

            expect(result.isOk()).toBe(true);
            // Second call should include correction
            const secondCallArgs = (toolCallingProvider.generateToolCallOutcome as ReturnType<typeof vi.fn>).mock.calls[1]?.[0];
            expect(secondCallArgs.correctionError).toBe('bad args: please fix');
        });

        it('returns error when policy says fail', async () => {
            const toolCallingProvider = createToolCallingProvider();
            const failurePolicy = createFailurePolicy();

            (toolCallingProvider.generateToolCallOutcome as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                failure: { code: 'model_no_tool_support', message: 'not supported', recoverable: false, retryable: false },
            });

            (failurePolicy.resolve as ReturnType<typeof vi.fn>).mockReturnValue({
                type: 'fail',
                reason: 'Model does not support tool calling',
            });

            const adapter = createAdapter({ toolCallingProvider, failurePolicy });
            const result = await adapter.generateAction(makeContext());

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toContain('Generation failed');
            }
        });

        it('wraps non-LLMError exceptions', async () => {
            const toolCallingProvider = createToolCallingProvider();
            (toolCallingProvider.generateToolCallOutcome as ReturnType<typeof vi.fn>).mockRejectedValue(
                new Error('network error')
            );

            const adapter = createAdapter({ toolCallingProvider });
            const result = await adapter.generateAction(makeContext());

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toContain('network error');
            }
        });
    });

    describe('generateAction vision handling', () => {
        it('includes images when vision is enabled and screenshots exist', async () => {
            const configService = createConfigService();
            (configService.get as ReturnType<typeof vi.fn>).mockReturnValue({
                ...createConfigService().get(),
                ai: { provider: 'google', model: 'gemini-2.0-flash', visionEnabled: true, debugScreenshots: false },
            });

            const toolCallingProvider = createToolCallingProvider();
            const adapter = createAdapter({ configService, toolCallingProvider });

            const context = makeContext({
                snapshot: {
                    dom: '<div>Hello</div>',
                    elements: [],
                    rootElements: { html: {}, body: {} },
                    screenshots: ['base64img1', 'base64img2'],
                } as unknown as LLMContext['snapshot'],
            });

            await adapter.generateAction(context);
            // Verify request contained images
            const calls = (toolCallingProvider.generateToolCallOutcome as ReturnType<typeof vi.fn>).mock.calls;
            expect(calls.length).toBeGreaterThan(0);
            expect(calls[0]?.[0].imagesBase64).toEqual(['base64img1', 'base64img2']);
        });

        it('excludes images when vision is disabled', async () => {
            const configService = createConfigService();
            (configService.get as ReturnType<typeof vi.fn>).mockReturnValue({
                ...createConfigService().get(),
                ai: { provider: 'google', model: 'gemini-2.0-flash', visionEnabled: false, debugScreenshots: false },
            });

            const toolCallingProvider = createToolCallingProvider();
            const adapter = createAdapter({ configService, toolCallingProvider });

            const context = makeContext({
                snapshot: {
                    dom: '<div>Hello</div>',
                    elements: [],
                    rootElements: { html: {}, body: {} },
                    screenshots: ['base64img1'],
                } as unknown as LLMContext['snapshot'],
            });

            await adapter.generateAction(context);
            const calls = (toolCallingProvider.generateToolCallOutcome as ReturnType<typeof vi.fn>).mock.calls;
            expect(calls.length).toBeGreaterThan(0);
            expect(calls[0]?.[0].imagesBase64).toBeUndefined();
        });
    });

    describe('generateEvaluation', () => {
        it('returns evaluation decision on success', async () => {
            const adapter = createAdapter();
            const result = await adapter.generateEvaluation(makeEvalContext());

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value.decision).toBe('approve');
            }
        });

        it('retries on retryable failure then succeeds', async () => {
            const toolCallingProvider = createToolCallingProvider();
            const actionToolMapper = createActionToolMapper();

            (toolCallingProvider.generateToolCallOutcome as ReturnType<typeof vi.fn>)
                .mockResolvedValueOnce({
                    ok: false,
                    failure: { code: 'no_tool_call', message: 'no call', recoverable: true, retryable: true },
                })
                .mockResolvedValueOnce({
                    ok: true,
                    result: { name: 'approve', args: { summary: 'ok', confidence: 0.9, evidence: ['done'] } },
                });

            const adapter = createAdapter({ toolCallingProvider, actionToolMapper });
            const result = await adapter.generateEvaluation(makeEvalContext());

            expect(result.isOk()).toBe(true);
            expect(toolCallingProvider.generateToolCallOutcome).toHaveBeenCalledTimes(2);
        });

        it('falls back to deterministic decision on non-retryable failure', async () => {
            const toolCallingProvider = createToolCallingProvider();

            (toolCallingProvider.generateToolCallOutcome as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                failure: { code: 'no_valid_tool_schema', message: 'bad schema', recoverable: false, retryable: false },
            });

            const adapter = createAdapter({ toolCallingProvider });
            const result = await adapter.generateEvaluation(makeEvalContext());

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value.decision).toBe('need_retry');
                expect(result.value.evidence).toContain('Evaluator fallback engaged: bad schema');
            }
        });
    });

    describe('buildFallbackEvaluationDecision', () => {
        it('returns error-specific advice for execution_error outcome', async () => {
            const toolCallingProvider = createToolCallingProvider();
            (toolCallingProvider.generateToolCallOutcome as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                failure: { code: 'no_tool_call', message: 'fail', recoverable: false, retryable: false },
            });

            const adapter = createAdapter({ toolCallingProvider });
            const context = makeEvalContext({
                executionOutcome: 'execution_error',
                executionError: 'Element not found',
            });

            const result = await adapter.generateEvaluation(context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value.advice).toBe('Element not found');
                expect(result.value.confidence).toBe(0.6);
            }
        });

        it('returns verification advice for PASS action', async () => {
            const toolCallingProvider = createToolCallingProvider();
            (toolCallingProvider.generateToolCallOutcome as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                failure: { code: 'no_tool_call', message: 'fail', recoverable: false, retryable: false },
            });

            const adapter = createAdapter({ toolCallingProvider });
            const context = makeEvalContext({
                attemptedAction: { type: ActionType.PASS, thought: 'done', summary: 'pass' } as any,
            });

            const result = await adapter.generateEvaluation(context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value.advice).toContain('verification action');
                expect(result.value.confidence).toBe(0.58);
            }
        });

        it('returns generic retry advice for other actions', async () => {
            const toolCallingProvider = createToolCallingProvider();
            (toolCallingProvider.generateToolCallOutcome as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                failure: { code: 'no_tool_call', message: 'fail', recoverable: false, retryable: false },
            });

            const adapter = createAdapter({ toolCallingProvider });
            const result = await adapter.generateEvaluation(makeEvalContext());

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value.confidence).toBe(0.55);
                expect(result.value.advice).toContain('evidence-gathering');
            }
        });
    });

    describe('generatePlan', () => {
        it('returns parsed plan from model response', async () => {
            const modelFactory = createModelFactory();
            const mockModel = {
                generateContent: vi.fn().mockResolvedValue({
                    response: {
                        candidates: [{
                            content: {
                                parts: [{
                                    text: JSON.stringify({
                                        goal: 'test plan',
                                        steps: [{
                                            description: 'step 1',
                                            type: 'browser',
                                            objective: 'loads page',
                                        }],
                                    }),
                                }],
                            },
                        }],
                    },
                }),
            };
            (modelFactory.createPlanningModel as ReturnType<typeof vi.fn>).mockReturnValue(mockModel);

            const adapter = createAdapter({ modelFactory });
            const result = await adapter.generatePlan('test the login flow');

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value.goal).toBe('test plan');
                expect(result.value.items).toHaveLength(1);
            }
        });

        it('returns error when model response has no candidates', async () => {
            const modelFactory = createModelFactory();
            const mockModel = {
                generateContent: vi.fn().mockResolvedValue({
                    response: { candidates: [] },
                }),
            };
            (modelFactory.createPlanningModel as ReturnType<typeof vi.fn>).mockReturnValue(mockModel);

            const adapter = createAdapter({ modelFactory });
            const result = await adapter.generatePlan('test');

            expect(result.isErr()).toBe(true);
        });

        it('wraps parse errors as LLMError', async () => {
            const modelFactory = createModelFactory();
            const mockModel = {
                generateContent: vi.fn().mockResolvedValue({
                    response: {
                        candidates: [{
                            content: { parts: [{ text: 'not valid json' }] },
                        }],
                    },
                }),
            };
            (modelFactory.createPlanningModel as ReturnType<typeof vi.fn>).mockReturnValue(mockModel);

            const adapter = createAdapter({ modelFactory });
            const result = await adapter.generatePlan('test');

            expect(result.isErr()).toBe(true);
        });
    });
});
