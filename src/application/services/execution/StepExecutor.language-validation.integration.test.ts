import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { StepExecutor } from './StepExecutor';
import { ActionType } from '@domain/enums/ActionType';

describe('StepExecutor language validation integration', () => {
    it('breaks repeated click loop and validates multilingual bar via extraction', async () => {
        const generateAction = vi.fn(async (context: { advice?: string }) => {
            if (context.advice?.includes('Choose a different strategy')) {
                return {
                    isErr: () => false,
                    value: {
                        type: ActionType.EXTRACT,
                        elementId: 2,
                        thought: 'Extract language labels from the language bar'
                    }
                };
            }

            return {
                isErr: () => false,
                value: {
                    type: ActionType.CLICK,
                    elementId: 1,
                    elementDescriptor: 'language bar toggle',
                    thought: 'Open language bar'
                }
            };
        });

        const llmProvider = {
            generateAction,
            generateEvaluation: vi.fn(async (context: { attemptedAction: { type: ActionType } }) => {
                if (context.attemptedAction.type === ActionType.PASS) {
                    return {
                        isErr: () => false,
                        value: {
                            decision: 'sub_task_success',
                            summary: 'Explicit pass accepted after multilingual evidence verification',
                            confidence: 0.98,
                            advice: 'done',
                            evidence: [
                                'Extracted labels include Arabic, English, French',
                                'Step summary confirms the multilingual language bar validation'
                            ]
                        }
                    };
                }

                if (context.attemptedAction.type === ActionType.EXTRACT) {
                    return {
                        isErr: () => false,
                        value: {
                            decision: 'sub_task_success',
                            summary: 'Validated language labels: Arabic, English, French',
                            confidence: 0.98,
                            advice: 'done',
                            evidence: ['Extracted labels include Arabic, English, French']
                        }
                    };
                }

                return {
                    isErr: () => false,
                    value: {
                        decision: 'need_retry',
                        summary: 'No language evidence captured yet',
                        confidence: 0.72,
                        advice: 'Collect direct evidence from the language selector',
                        evidence: ['Click did not yet produce language-label evidence']
                    }
                };
            })
        };

        const loopDetector = {
            isLoop: vi.fn((history: Array<{ type: ActionType; elementId?: number }>, action: { type: ActionType; elementId?: number }) => {
                const last = history[history.length - 1];
                return action.type === ActionType.CLICK
                    && last?.type === ActionType.CLICK
                    && last.elementId === action.elementId;
            })
        };

        const perception = {
            capture: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: {
                    id: 'frame-1',
                    timestamp: Date.now(),
                    metadata: {
                        url: 'https://ibraverse.ca/',
                        title: 'Ibraverse',
                        viewport: { width: 1280, height: 800 }
                    },
                    vision: { count: 0, screenshots: [], primaryScreenshot: undefined },
                    semantic: {
                        dom: {
                            url: 'https://ibraverse.ca/',
                            title: 'Ibraverse',
                            rootElements: { html: {}, body: {} },
                            elements: [
                                { id: 1, tag: 'button', text: 'Language', attributes: {} },
                                { id: 2, tag: 'div', text: 'العربية English Français', attributes: {} }
                            ]
                        },
                        accessibility: null
                    }
                }
            })
        };

        const storage = { savePerceptionAssets: vi.fn().mockResolvedValue({}), saveTemporalWindow: vi.fn().mockResolvedValue({}) };
        const trace = {
            startTrace: vi.fn().mockResolvedValue(undefined),
            endTrace: vi.fn().mockResolvedValue(undefined),
            tracePerception: vi.fn().mockResolvedValue(undefined),
            traceReasoning: vi.fn().mockResolvedValue(undefined)
        };

        const assertionGoalService = { evaluate: vi.fn().mockReturnValue(null) };
        const toolCapabilityRegistry = { getToolDescriptors: vi.fn().mockReturnValue([]) };
        const toolExecutor = {
            execute: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: undefined
            })
        };

        const temporalPolicy = { planCapture: vi.fn().mockReturnValue({ mode: 'off', enabled: false, maxFrames: 1, burstIntervalMs: 1, maxFramesPerWindow: 1 }) };
        const timelineAssembler = { assemble: vi.fn() };
        const temporalSelector = { select: vi.fn() };
        const temporalPrivacyFilter = { redact: vi.fn() };
        const temporalPromptAssembler = { assemble: vi.fn() };
        const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

        const executor = new StepExecutor(
            llmProvider as unknown as never,
            loopDetector as unknown as never,
            perception as unknown as never,
            storage as unknown as never,
            trace as unknown as never,
            assertionGoalService as unknown as never,
            toolCapabilityRegistry as unknown as never,
            toolExecutor as unknown as never,
            temporalPolicy as unknown as never,
            timelineAssembler as unknown as never,
            temporalSelector as unknown as never,
            temporalPrivacyFilter as unknown as never,
            temporalPromptAssembler as unknown as never,
            logger as unknown as never
        );

        const browser = {
            getViewportSize: vi.fn().mockResolvedValue({ width: 1280, height: 800 }),
            extractText: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: 'العربية English Français'
            })
        };

        const generator = executor.executeStep(
            'run-language-validation',
            'Open the website language bar and validate Arabic, English, and French labels',
            browser as unknown as never,
            'https://ibraverse.ca/',
            0,
            { vision: false, debugScreenshots: false, maxActions: 6, supervisedTerminalPass: true }
        );

        const actionEvents: Array<{ type: ActionType }> = [];

        while (true) {
            const iteration = await generator.next();
            if (iteration.done) {
                expect(iteration.value.success).toBe(true);
                break;
            }

            if (typeof iteration.value === 'object' && iteration.value && 'type' in iteration.value && iteration.value.type === 'action') {
                actionEvents.push({ type: iteration.value.action.type });
            }
        }

        expect(actionEvents.map((entry) => entry.type)).toEqual([ActionType.CLICK, ActionType.EXTRACT]);
        expect(browser.extractText).toHaveBeenCalledTimes(1);
        expect(toolExecutor.execute).toHaveBeenCalledTimes(1);
        expect(generateAction).toHaveBeenCalledTimes(3);

        const advicePayloads = generateAction.mock.calls
            .map((call) => call[0] as { advice?: string })
            .filter((payload) => typeof payload.advice === 'string')
            .map((payload) => payload.advice ?? '');

        expect(advicePayloads.some((advice) => advice.includes('Choose a different strategy'))).toBe(true);
    });
});
