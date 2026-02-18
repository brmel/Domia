import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { StepExecutor } from './StepExecutor';
import { ActionType } from '@domain/enums/ActionType';

describe('StepExecutor operator override', () => {
    it('executes queued override action without calling LLM generateAction', async () => {
        const llmProvider = {
            generateAction: vi.fn(),
            generateEvaluation: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: {
                    decision: 'sub_task_success',
                    summary: 'override succeeded',
                    confidence: 0.93,
                    evidence: ['Operator override action executed successfully.']
                }
            })
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
                        viewport: { width: 1280, height: 720 }
                    },
                    vision: {
                        count: 0,
                        screenshots: [],
                        primaryScreenshot: undefined
                    },
                    semantic: {
                        dom: {
                            url: 'https://example.com',
                            title: 'Example',
                            rootElements: { html: {}, body: {} },
                            elements: []
                        },
                        accessibility: null
                    }
                }
            })
        };

        const trace = {
            startTrace: vi.fn().mockResolvedValue(undefined),
            endTrace: vi.fn().mockResolvedValue(undefined),
            tracePerception: vi.fn().mockResolvedValue(undefined),
            traceReasoning: vi.fn().mockResolvedValue(undefined)
        };

        const toolExecutor = {
            execute: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: undefined
            })
        };

        const executor = new StepExecutor(
            llmProvider as unknown as never,
            { isLoop: vi.fn().mockReturnValue(false) } as unknown as never,
            perception as unknown as never,
            { savePerceptionAssets: vi.fn().mockResolvedValue({}) } as unknown as never,
            trace as unknown as never,
            { evaluate: vi.fn().mockReturnValue(null) } as unknown as never,
            { getToolDescriptors: vi.fn().mockReturnValue([]) } as unknown as never,
            toolExecutor as unknown as never,
            { planCapture: vi.fn().mockReturnValue({ enabled: false }) } as unknown as never,
            { assemble: vi.fn() } as unknown as never,
            { select: vi.fn() } as unknown as never,
            { redact: vi.fn() } as unknown as never,
            { assemble: vi.fn() } as unknown as never,
            { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as never
        );

        const overrideAction = {
            type: ActionType.MOUSE_CLICK_LEFT,
            x: 100,
            y: 200,
            thought: 'operator click override'
        };

        const gen = executor.executeStep(
            'run-override',
            'click the primary CTA',
            { getViewportSize: vi.fn().mockResolvedValue({ width: 1280, height: 720 }) } as unknown as never,
            'https://example.com',
            0,
            {
                vision: false,
                debugScreenshots: false,
                maxActions: 3,
                supervisedTerminalPass: false,
                temporalObservation: false
            },
            {
                overrideProvider: {
                    consumeActionOverride: vi.fn(() => overrideAction as unknown as never)
                }
            }
        );

        const yielded = await gen.next();
        expect(yielded.done).toBe(false);
        if (yielded.done || !yielded.value || typeof yielded.value !== 'object' || !('type' in yielded.value)) {
            throw new Error('Expected action yield');
        }

        if (yielded.value.type !== 'action') {
            throw new Error('Expected action envelope');
        }

        expect(yielded.value.action).toEqual(overrideAction);

        const terminal = await gen.next();
        expect(terminal.done).toBe(true);
        if (!terminal.done || !terminal.value || typeof terminal.value !== 'object' || !('success' in terminal.value)) {
            throw new Error('Expected terminal result');
        }

        expect(terminal.value.success).toBe(true);
        expect(llmProvider.generateAction).not.toHaveBeenCalled();
        expect(toolExecutor.execute).toHaveBeenCalledTimes(1);
    });
});
