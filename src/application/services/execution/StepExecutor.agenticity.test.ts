import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { StepExecutor } from './StepExecutor';
import { ActionType } from '@domain/enums/ActionType';

describe('StepExecutor agenticity contract', () => {
    it('does not deterministically rewrite repeated click into extract action', async () => {
        const llmProvider = {
            generateAction: vi.fn()
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        type: ActionType.CLICK,
                        elementId: 1,
                        elementDescriptor: 'language option',
                        thought: 'click language option'
                    }
                })
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        type: ActionType.PASS,
                        summary: 'done',
                        thought: 'stop'
                    }
                }),
            generateEvaluation: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: {
                    decision: 'sub_task_success',
                    summary: 'done',
                    confidence: 0.99,
                    evidence: ['success']
                }
            })
        };

        const loopDetector = {
            isLoop: vi.fn((_: unknown, action: { type: ActionType }) => action.type === ActionType.CLICK)
        };

        const perception = {
            capture: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: {
                    id: 'frame-1',
                    timestamp: Date.now(),
                    metadata: {
                        url: 'https://example.com',
                        title: 'Example',
                        viewport: { width: 1200, height: 800 }
                    },
                    vision: { count: 0, screenshots: [], primaryScreenshot: undefined },
                    semantic: {
                        dom: {
                            url: 'https://example.com',
                            title: 'Example',
                            rootElements: { html: {}, body: {} },
                            elements: [{ id: 1, tag: 'button', text: 'Arabic', attributes: {} }]
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
        const toolContractService = { getToolDescriptors: vi.fn().mockReturnValue([]) };
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
            toolContractService as unknown as never,
            toolExecutor as unknown as never,
            temporalPolicy as unknown as never,
            timelineAssembler as unknown as never,
            temporalSelector as unknown as never,
            temporalPrivacyFilter as unknown as never,
            temporalPromptAssembler as unknown as never,
            logger as unknown as never
        );

        const browser = {
            getViewportSize: vi.fn().mockResolvedValue({ width: 1200, height: 800 }),
            extractText: vi.fn()
        };

        const generator = executor.executeStep(
            'run-1',
            'verify supported languages',
            browser as unknown as never,
            'https://example.com',
            0,
            { vision: false, debugScreenshots: false, maxActions: 3, supervisedTerminalPass: false }
        );

        const first = await generator.next();
        expect(first.done).toBe(false);
        if (first.done || typeof first.value !== 'object' || first.value === null || !('type' in first.value)) {
            throw new Error('Expected first action event');
        }

        expect(first.value.type).toBe('action');
        if (first.value.type !== 'action') {
            throw new Error('Expected action payload');
        }

        expect(first.value.action.type).toBe(ActionType.PASS);
        expect(browser.extractText).not.toHaveBeenCalled();
        expect(llmProvider.generateAction).toHaveBeenCalledTimes(2);

        const terminal = await generator.next();
        expect(terminal.done).toBe(true);
        if (!terminal.done || typeof terminal.value !== 'object' || terminal.value === null || !('success' in terminal.value)) {
            throw new Error('Expected terminal result');
        }
        expect(terminal.value.success).toBe(true);
    });
});
