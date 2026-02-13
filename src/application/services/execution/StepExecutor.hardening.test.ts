import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { StepExecutor } from './StepExecutor';
import { ActionType } from '@domain/enums/ActionType';

describe('StepExecutor hardening', () => {
    it('continues when perception/temporal persistence fails', async () => {
        const llmProvider = { generateAction: vi.fn() };
        const loopDetector = { isLoop: vi.fn().mockReturnValue(false) };

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

        const storage = {
            savePerceptionAssets: vi.fn().mockRejectedValue(new Error('disk-full')),
            saveTemporalWindow: vi.fn().mockRejectedValue(new Error('timeline-write-failed'))
        };

        const trace = {
            startTrace: vi.fn().mockResolvedValue(undefined),
            endTrace: vi.fn().mockResolvedValue(undefined),
            tracePerception: vi.fn().mockResolvedValue(undefined),
            traceReasoning: vi.fn().mockResolvedValue(undefined)
        };

        const assertionGoalService = {
            evaluate: vi.fn().mockReturnValue({
                type: ActionType.PASS,
                summary: 'ok',
                thought: 'done'
            })
        };

        const toolContractService = { getToolDescriptors: vi.fn().mockReturnValue([]) };
        const toolExecutor = {
            execute: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: undefined
            })
        };
        const temporalPolicy = {
            planCapture: vi.fn().mockReturnValue({
                mode: 'adaptive',
                enabled: true,
                maxFrames: 1,
                burstIntervalMs: 1,
                maxFramesPerWindow: 3
            })
        };
        const timelineAssembler = {
            assemble: vi.fn().mockReturnValue({
                runId: 'run-1',
                fromTimestamp: Date.now(),
                toTimestamp: Date.now(),
                summary: 'timeline',
                frames: [{ timestamp: Date.now(), intervalMs: 100, domHash: 'abc' }]
            })
        };
        const temporalSelector = { select: vi.fn().mockReturnValue({ frames: [{ timestamp: Date.now(), intervalMs: 100, domHash: 'abc' }], droppedFrameCount: 0 }) };
        const temporalPrivacyFilter = { redact: vi.fn().mockReturnValue({ frames: [{ timestamp: Date.now(), intervalMs: 100, domHash: 'abc…' }], redactionApplied: true }) };
        const temporalPromptAssembler = {
            assemble: vi.fn().mockReturnValue({
                runId: 'run-1',
                fromTimestamp: Date.now(),
                toTimestamp: Date.now(),
                summary: 'temporal',
                mode: 'adaptive',
                frames: [{ timestamp: Date.now(), intervalMs: 100, domHash: 'abc…' }],
                redactionApplied: true,
                tokenEstimate: 22
            })
        };
        const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

        const executor = new StepExecutor(
            llmProvider as any,
            loopDetector as any,
            perception as any,
            storage as any,
            trace as any,
            assertionGoalService as any,
            toolContractService as any,
            toolExecutor as any,
            temporalPolicy as any,
            timelineAssembler as any,
            temporalSelector as any,
            temporalPrivacyFilter as any,
            temporalPromptAssembler as any,
            logger as any
        );

        const browser = {
            getViewportSize: vi.fn().mockResolvedValue({ width: 1200, height: 800 })
        };

        const generator = executor.executeStep(
            'run-1',
            'verify',
            browser as any,
            'https://example.com',
            0,
            {
                vision: false,
                debugScreenshots: false,
                maxActions: 5,
                temporalObservation: true,
                temporalPersistWindow: true
            }
        );

        const first = await generator.next();
        expect(first.done).toBe(false);
        if (first.done || typeof first.value !== 'object' || first.value === null || !('type' in first.value)) {
            throw new Error('Expected action yield before terminal result');
        }
        expect(first.value.type).toBe('action');

        const terminal = await generator.next();
        expect(terminal.done).toBe(true);
        if (!terminal.done || typeof terminal.value !== 'object' || terminal.value === null || !('success' in terminal.value)) {
            throw new Error('Expected terminal step execution result');
        }
        expect(terminal.value.success).toBe(true);
        expect(logger.warn).toHaveBeenCalled();
    });
});
