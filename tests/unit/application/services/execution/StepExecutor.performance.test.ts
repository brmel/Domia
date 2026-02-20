import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { StepExecutor } from '@application/services/execution/StepExecutor';
import { ActionType } from '@domain/enums/ActionType';

describe('StepExecutor performance hardening', () => {
    it('stops temporal capture early on stable DOM signatures', async () => {
        const llmProvider = {
            generateAction: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: {
                    type: ActionType.PASS,
                    summary: 'done',
                    thought: 'pass now'
                }
            }),
            generateEvaluation: vi.fn()
        };

        const perceptionCapture = vi.fn().mockResolvedValue({
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
                        elements: [{ tag: 'button', text: 'Run', role: 'button' }]
                    },
                    accessibility: null
                }
            }
        });

        const executor = new StepExecutor(
            llmProvider as unknown as never,
            {
            isLoop: vi.fn().mockReturnValue(false),
            getActionSignature: vi.fn((action: { type: string }) => action.type)
        } as unknown as never,
            { capture: perceptionCapture } as unknown as never,
            { savePerceptionAssets: vi.fn().mockResolvedValue({}) } as unknown as never,
            {
                startTrace: vi.fn().mockResolvedValue(undefined),
                endTrace: vi.fn().mockResolvedValue(undefined),
                tracePerception: vi.fn().mockResolvedValue(undefined),
                traceReasoning: vi.fn().mockResolvedValue(undefined)
            } as unknown as never,
            { evaluate: vi.fn().mockReturnValue(null) } as unknown as never,
            { getToolDescriptors: vi.fn().mockReturnValue([]) } as unknown as never,
            { execute: vi.fn() } as unknown as never,
            {
                planCapture: vi.fn().mockReturnValue({
                    enabled: true,
                    mode: 'adaptive',
                    maxFrames: 8,
                    maxFramesPerWindow: 8,
                    burstIntervalMs: 0
                })
            } as unknown as never,
            { assemble: vi.fn((_runId: string, frames: unknown[]) => ({ frames })) } as unknown as never,
            { select: vi.fn((frames: unknown[]) => ({ frames, droppedFrameCount: 0 })) } as unknown as never,
            { redact: vi.fn((frames: unknown[]) => ({ frames, redactionApplied: false })) } as unknown as never,
            { assemble: vi.fn(({ frames }: { frames: unknown[] }) => ({ frames, summary: 'stable', fromTimestamp: 1, toTimestamp: 2 })) } as unknown as never,
            { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as never
        );

        const gen = executor.executeStep(
            'run-perf',
            'verify stable page',
            { getViewportSize: vi.fn().mockResolvedValue({ width: 1280, height: 720 }) } as unknown as never,
            'https://example.com',
            0,
            {
                vision: false,
                debugScreenshots: false,
                maxActions: 2,
                supervisedTerminalPass: false,
                temporalObservation: true,
                temporalBurstFrames: 8,
                temporalBurstIntervalMs: 0
            }
        );

        await gen.next();
        await gen.next();

        expect(perceptionCapture).toHaveBeenCalledTimes(3);
    });
});
