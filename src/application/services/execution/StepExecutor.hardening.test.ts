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

    it('does not invoke tool executor for terminal pass action', async () => {
        const llmProvider = {
            generateAction: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: {
                    type: ActionType.PASS,
                    summary: 'done',
                    thought: 'complete'
                }
            })
        };
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
                    vision: { count: 0, screenshots: [], primaryScreenshot: undefined },
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

        const temporalPolicy = {
            planCapture: vi.fn().mockReturnValue({
                mode: 'off',
                enabled: false,
                maxFrames: 1,
                burstIntervalMs: 1,
                maxFramesPerWindow: 1
            })
        };
        const timelineAssembler = { assemble: vi.fn() };
        const temporalSelector = { select: vi.fn() };
        const temporalPrivacyFilter = { redact: vi.fn() };
        const temporalPromptAssembler = { assemble: vi.fn() };
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
            { vision: false, debugScreenshots: false, maxActions: 5 }
        );

        const first = await generator.next();
        expect(first.done).toBe(false);

        const terminal = await generator.next();
        expect(terminal.done).toBe(true);
        if (!terminal.done || typeof terminal.value !== 'object' || terminal.value === null || !('success' in terminal.value)) {
            throw new Error('Expected terminal step execution result');
        }
        expect(terminal.value.success).toBe(true);
        expect(toolExecutor.execute).not.toHaveBeenCalled();
    });

    it('treats first fail as provisional and can recover on next action', async () => {
        const llmProvider = {
            generateAction: vi.fn()
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        type: ActionType.FAIL,
                        reason: 'Element not found on first attempt.',
                        thought: 'Could not proceed yet.'
                    }
                })
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        type: ActionType.PASS,
                        summary: 'Goal reached after re-evaluation.',
                        thought: 'Second check confirms completion.'
                    }
                })
        };
        const loopDetector = { isLoop: vi.fn().mockReturnValue(false) };

        const perception = {
            capture: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: {
                    id: 'frame-1',
                    timestamp: Date.now(),
                    metadata: {
                        url: 'https://example.com/app',
                        title: 'App',
                        viewport: { width: 1200, height: 800 }
                    },
                    vision: { count: 0, screenshots: [], primaryScreenshot: undefined },
                    semantic: {
                        dom: {
                            url: 'https://example.com/app',
                            title: 'App',
                            rootElements: { html: {}, body: {} },
                            elements: []
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

        const temporalPolicy = {
            planCapture: vi.fn().mockReturnValue({
                mode: 'off',
                enabled: false,
                maxFrames: 1,
                burstIntervalMs: 1,
                maxFramesPerWindow: 1
            })
        };
        const timelineAssembler = { assemble: vi.fn() };
        const temporalSelector = { select: vi.fn() };
        const temporalPrivacyFilter = { redact: vi.fn() };
        const temporalPromptAssembler = { assemble: vi.fn() };
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
            'Verify the target state is visible',
            browser as any,
            'https://example.com/app',
            0,
            { vision: false, debugScreenshots: false, maxActions: 5 }
        );

        const first = await generator.next();
        expect(first.done).toBe(false);
        if (first.done || typeof first.value !== 'object' || first.value === null || !('type' in first.value)) {
            throw new Error('Expected action yield before terminal result');
        }
        expect(first.value.type).toBe('action');
        if (first.value.type !== 'action') {
            throw new Error('Expected action envelope');
        }
        expect(first.value.action.type).toBe(ActionType.FAIL);

        const second = await generator.next();
        expect(second.done).toBe(false);
        if (second.done || typeof second.value !== 'object' || second.value === null || !('type' in second.value)) {
            throw new Error('Expected second action yield before terminal result');
        }
        expect(second.value.type).toBe('action');
        if (second.value.type !== 'action') {
            throw new Error('Expected action envelope');
        }
        expect(second.value.action.type).toBe(ActionType.PASS);

        const terminal = await generator.next();
        expect(terminal.done).toBe(true);
        if (!terminal.done || typeof terminal.value !== 'object' || terminal.value === null || !('success' in terminal.value)) {
            throw new Error('Expected terminal step execution result');
        }
        expect(terminal.value.success).toBe(true);
        expect(toolExecutor.execute).not.toHaveBeenCalled();
    });

    it('returns terminal fail after consecutive fail signals', async () => {
        const llmProvider = {
            generateAction: vi.fn()
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        type: ActionType.FAIL,
                        reason: 'First failure',
                        thought: 'Attempt failed.'
                    }
                })
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        type: ActionType.FAIL,
                        reason: 'Second failure',
                        thought: 'Still cannot proceed.'
                    }
                })
        };
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
                    vision: { count: 0, screenshots: [], primaryScreenshot: undefined },
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

        const temporalPolicy = {
            planCapture: vi.fn().mockReturnValue({
                mode: 'off',
                enabled: false,
                maxFrames: 1,
                burstIntervalMs: 1,
                maxFramesPerWindow: 1
            })
        };
        const timelineAssembler = { assemble: vi.fn() };
        const temporalSelector = { select: vi.fn() };
        const temporalPrivacyFilter = { redact: vi.fn() };
        const temporalPromptAssembler = { assemble: vi.fn() };
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
            'Verify something',
            browser as any,
            'https://example.com',
            0,
            { vision: false, debugScreenshots: false, maxActions: 5 }
        );

        const first = await generator.next();
        expect(first.done).toBe(false);
        const second = await generator.next();
        expect(second.done).toBe(false);
        if (second.done || typeof second.value !== 'object' || second.value === null || !('type' in second.value)) {
            throw new Error('Expected second action yield before terminal result');
        }
        expect(second.value.type).toBe('action');
        if (second.value.type !== 'action') {
            throw new Error('Expected action envelope');
        }
        expect(second.value.action.type).toBe(ActionType.FAIL);

        const terminal = await generator.next();
        expect(terminal.done).toBe(true);
        if (!terminal.done || typeof terminal.value !== 'object' || terminal.value === null || !('success' in terminal.value)) {
            throw new Error('Expected terminal step execution result');
        }
        expect(terminal.value.success).toBe(false);
        if ('code' in terminal.value) {
            expect(terminal.value.code).toBe('agent_fail');
        }
        expect(toolExecutor.execute).not.toHaveBeenCalled();
    });
});
