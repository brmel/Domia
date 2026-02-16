import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { StepExecutor } from './StepExecutor';
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
            llmProvider as any,
            { isLoop: vi.fn().mockReturnValue(false) } as any,
            { capture: perceptionCapture } as any,
            { savePerceptionAssets: vi.fn().mockResolvedValue({}) } as any,
            {
                startTrace: vi.fn().mockResolvedValue(undefined),
                endTrace: vi.fn().mockResolvedValue(undefined),
                tracePerception: vi.fn().mockResolvedValue(undefined),
                traceReasoning: vi.fn().mockResolvedValue(undefined)
            } as any,
            { evaluate: vi.fn().mockReturnValue(null) } as any,
            { getToolDescriptors: vi.fn().mockReturnValue([]) } as any,
            { execute: vi.fn() } as any,
            {
                planCapture: vi.fn().mockReturnValue({
                    enabled: true,
                    mode: 'adaptive',
                    maxFrames: 8,
                    maxFramesPerWindow: 8,
                    burstIntervalMs: 0
                })
            } as any,
            { assemble: vi.fn((_runId: string, frames: any[]) => ({ frames })) } as any,
            { select: vi.fn((frames: any[]) => ({ frames, droppedFrameCount: 0 })) } as any,
            { redact: vi.fn((frames: any[]) => ({ frames, redactionApplied: false })) } as any,
            { assemble: vi.fn(({ frames }: { frames: any[] }) => ({ frames, summary: 'stable', fromTimestamp: 1, toTimestamp: 2 })) } as any,
            { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        );

        const gen = executor.executeStep(
            'run-perf',
            'verify stable page',
            { getViewportSize: vi.fn().mockResolvedValue({ width: 1280, height: 720 }) } as any,
            'https://example.com',
            0,
            {
                vision: false,
                debugScreenshots: false,
                maxActions: 2,
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
