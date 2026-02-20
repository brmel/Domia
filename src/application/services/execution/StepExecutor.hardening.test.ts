import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { StepExecutor } from './StepExecutor';
import { ActionType } from '@domain/enums/ActionType';

describe('StepExecutor hardening', () => {
    it('continues when perception/temporal persistence fails', async () => {
        const llmProvider = {
            generateAction: vi.fn(),
            generateEvaluation: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: {
                    decision: 'sub_task_success',
                    summary: 'done'
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
            extractText: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: 'English Arabic French'
            })
        };

        const generator = executor.executeStep(
            'run-1',
            'verify',
            browser as unknown as never,
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

    it('does not invoke tool executor for terminal pass action when supervision is explicitly disabled', async () => {
        const llmProvider = {
            generateAction: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: {
                    type: ActionType.PASS,
                    summary: 'done',
                    thought: 'complete'
                }
            }),
            generateEvaluation: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: {
                    decision: 'sub_task_success',
                    summary: 'done'
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
            extractText: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: 'English Arabic French'
            })
        };

        const generator = executor.executeStep(
            'run-1',
            'verify',
            browser as unknown as never,
            'https://example.com',
            0,
            { vision: false, debugScreenshots: false, maxActions: 5, supervisedTerminalPass: false }
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
        expect(llmProvider.generateEvaluation).not.toHaveBeenCalled();
    });

    it('requires prior verification action before terminal pass in supervised mode', async () => {
        const llmProvider = {
            generateAction: vi.fn()
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        type: ActionType.PASS,
                        summary: 'looks complete',
                        thought: 'pass now'
                    }
                })
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        type: ActionType.EXTRACT,
                        elementId: 1,
                        thought: 'collect evidence before pass retry'
                    }
                })
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        type: ActionType.PASS,
                        summary: 'confirmed complete',
                        thought: 'pass confirmed'
                    }
                }),
            generateEvaluation: vi.fn()
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        decision: 'need_retry',
                        summary: 'Need one more confirmation step',
                        advice: 'Re-check final state and confirm.',
                        confidence: 0.72,
                        evidence: ['Terminal pass requires supervised confirmation.']
                    }
                })
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        decision: 'need_retry',
                        summary: 'Evidence extracted; now issue explicit pass.',
                        advice: 'Issue PASS with concise evidence summary.',
                        confidence: 0.81,
                        evidence: ['Extraction completed for confirmation.']
                    }
                })
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        decision: 'sub_task_success',
                        summary: 'Confirmed done',
                        confidence: 0.94,
                        evidence: [
                            'Final confirmation signal observed after retry.',
                            'No contradictory state detected in follow-up check.'
                        ]
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
            extractText: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: 'English Arabic French'
            })
        };

        const generator = executor.executeStep(
            'run-supervised-pass',
            'verify',
            browser as unknown as never,
            'https://example.com',
            0,
            { vision: false, debugScreenshots: false, maxActions: 5, supervisedTerminalPass: true }
        );

        const first = await generator.next();
        expect(first.done).toBe(false);
        if (first.done || typeof first.value !== 'object' || first.value === null || !('type' in first.value)) {
            throw new Error('Expected first action yield before terminal result');
        }
        expect(first.value.type).toBe('action');
        if (first.value.type === 'action') {
            expect(first.value.action.type).toBe(ActionType.EXTRACT);
        }

        const second = await generator.next();
        expect(second.done).toBe(false);
        if (second.done || typeof second.value !== 'object' || second.value === null || !('type' in second.value)) {
            throw new Error('Expected second action yield before terminal result');
        }
        expect(second.value.type).toBe('action');
        if (second.value.type === 'action') {
            expect(second.value.action.type).toBe(ActionType.PASS);
        }

        const terminal = await generator.next();
        expect(terminal.done).toBe(true);
        if (!terminal.done || typeof terminal.value !== 'object' || terminal.value === null || !('success' in terminal.value)) {
            throw new Error('Expected terminal step execution result');
        }
        expect(terminal.value.success).toBe(true);
        expect(llmProvider.generateEvaluation).toHaveBeenCalledTimes(1);
        expect(toolExecutor.execute).not.toHaveBeenCalled();
    });

    it('enforces supervised pass gating by default when option is omitted', async () => {
        const llmProvider = {
            generateAction: vi.fn()
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        type: ActionType.PASS,
                        summary: 'looks complete',
                        thought: 'pass now'
                    }
                })
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        type: ActionType.EXTRACT,
                        elementId: 1,
                        thought: 'collect evidence before pass retry'
                    }
                })
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        type: ActionType.PASS,
                        summary: 'confirmed complete',
                        thought: 'pass confirmed'
                    }
                }),
            generateEvaluation: vi.fn()
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        decision: 'need_retry',
                        summary: 'Need one more confirmation step',
                        advice: 'Re-check final state and confirm.',
                        confidence: 0.72,
                        evidence: ['Terminal pass requires supervised confirmation.']
                    }
                })
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        decision: 'need_retry',
                        summary: 'Evidence extracted; now issue explicit pass.',
                        advice: 'Issue PASS with concise evidence summary.',
                        confidence: 0.81,
                        evidence: ['Extraction completed for confirmation.']
                    }
                })
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        decision: 'sub_task_success',
                        summary: 'Confirmed done',
                        confidence: 0.95,
                        evidence: ['Explicit confirmation signal one.', 'Explicit confirmation signal two.']
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
            extractText: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: 'English Arabic French'
            })
        };

        const generator = executor.executeStep(
            'run-supervised-default',
            'verify',
            browser as unknown as never,
            'https://example.com',
            0,
            { vision: false, debugScreenshots: false, maxActions: 5 }
        );

        const first = await generator.next();
        expect(first.done).toBe(false);
        if (first.done || typeof first.value !== 'object' || first.value === null || !('type' in first.value)) {
            throw new Error('Expected first action yield before terminal result');
        }
        expect(first.value.type).toBe('action');
        if (first.value.type === 'action') {
            expect(first.value.action.type).toBe(ActionType.EXTRACT);
        }

        const second = await generator.next();
        expect(second.done).toBe(false);
        if (second.done || typeof second.value !== 'object' || second.value === null || !('type' in second.value)) {
            throw new Error('Expected second action yield before terminal result');
        }
        expect(second.value.type).toBe('action');
        if (second.value.type === 'action') {
            expect(second.value.action.type).toBe(ActionType.PASS);
        }

        const terminal = await generator.next();

        expect(terminal.done).toBe(true);
        if (!terminal.done || typeof terminal.value !== 'object' || terminal.value === null || !('success' in terminal.value)) {
            throw new Error('Expected terminal step execution result');
        }
        expect(terminal.value.success).toBe(true);
        expect(llmProvider.generateEvaluation).toHaveBeenCalledTimes(1);
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
                }),
            generateEvaluation: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: {
                    decision: 'need_retry',
                    summary: 'Retry with alternate check',
                    advice: 'Check for delayed render and re-evaluate.',
                    confidence: 0.63,
                    evidence: ['Initial fail is provisional and should be retried.']
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
            getViewportSize: vi.fn().mockResolvedValue({ width: 1200, height: 800 })
        };

        const generator = executor.executeStep(
            'run-1',
            'Verify the target state is visible',
            browser as unknown as never,
            'https://example.com/app',
            0,
            { vision: false, debugScreenshots: false, maxActions: 5, supervisedTerminalPass: false }
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
                }),
            generateEvaluation: vi.fn()
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        decision: 'need_retry',
                        summary: 'Retry once',
                        advice: 'Try an alternate interaction.',
                        confidence: 0.68,
                        evidence: ['First fail may be transient.']
                    }
                })
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        decision: 'need_reformulate',
                        summary: 'Blocked after retry',
                        advice: 'Reformulate goal with narrower expectation.',
                        confidence: 0.82,
                        evidence: ['Second fail indicates persistent blockage.']
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
            getViewportSize: vi.fn().mockResolvedValue({ width: 1200, height: 800 })
        };

        const generator = executor.executeStep(
            'run-1',
            'Verify something',
            browser as unknown as never,
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

    it('stops repeated no-progress scroll actions before max action budget', async () => {
        const llmProvider = {
            generateAction: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: {
                    type: ActionType.SCROLL,
                    direction: 'down',
                    thought: 'Try scrolling for more content.'
                }
            }),
            generateEvaluation: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: {
                    decision: 'need_retry',
                    summary: 'Still searching',
                    advice: 'Continue scrolling to find target content.',
                    confidence: 0.66,
                    evidence: ['No target signal yet after scroll.']
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
                            elements: [
                                { id: '1', tag: 'button', role: 'button', text: 'Static Button', attributes: {}, boundingBox: null }
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
            getViewportSize: vi.fn().mockResolvedValue({ width: 1200, height: 800 })
        };

        const generator = executor.executeStep(
            'run-1',
            'Find and verify target content',
            browser as unknown as never,
            'https://example.com',
            0,
            { vision: false, debugScreenshots: false, maxActions: 20 }
        );

        for (let index = 0; index < 3; index++) {
            const next = await generator.next();
            expect(next.done).toBe(false);
            if (next.done || typeof next.value !== 'object' || next.value === null || !('type' in next.value)) {
                throw new Error('Expected action envelope before terminal result');
            }
            expect(next.value.type).toBe('action');
        }

        const terminal = await generator.next();
        expect(terminal.done).toBe(true);
        if (!terminal.done || typeof terminal.value !== 'object' || terminal.value === null || !('success' in terminal.value)) {
            throw new Error('Expected terminal step execution result');
        }
        expect(terminal.value.success).toBe(false);
        if ('code' in terminal.value) {
            expect(terminal.value.code).toBe('loop_detected');
        }
        expect(toolExecutor.execute).toHaveBeenCalledTimes(3);
    });

    it('blocks out-of-viewport coordinate action and retries with evaluator advice', async () => {
        const llmProvider = {
            generateAction: vi.fn()
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        type: ActionType.MOUSE_CLICK_LEFT,
                        x: 3000,
                        y: 2000,
                        thought: 'Click far outside viewport'
                    }
                })
                .mockResolvedValueOnce({
                    isErr: () => false,
                    value: {
                        type: ActionType.PASS,
                        summary: 'Recovered on retry',
                        thought: 'Step is complete now'
                    }
                }),
            generateEvaluation: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: {
                    decision: 'need_retry',
                    summary: 'Coordinates invalid for viewport',
                    advice: 'Choose coordinates inside current viewport bounds.',
                    confidence: 0.71,
                    evidence: ['Viewport guard rejected out-of-bounds coordinates.']
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
            getViewportSize: vi.fn().mockResolvedValue({ width: 1200, height: 800 })
        };

        const generator = executor.executeStep(
            'run-viewport-guard',
            'Verify coordinate safety',
            browser as unknown as never,
            'https://example.com',
            0,
            { vision: false, debugScreenshots: false, maxActions: 5, supervisedTerminalPass: false }
        );

        const first = await generator.next();
        expect(first.done).toBe(false);
        const second = await generator.next();
        expect(second.done).toBe(false);
        const terminal = await generator.next();

        expect(terminal.done).toBe(true);
        if (!terminal.done || typeof terminal.value !== 'object' || terminal.value === null || !('success' in terminal.value)) {
            throw new Error('Expected terminal step execution result');
        }

        expect(terminal.value.success).toBe(true);
        expect(toolExecutor.execute).not.toHaveBeenCalled();
        expect(llmProvider.generateEvaluation).toHaveBeenCalledTimes(1);
    });

    it('invokes evaluation callback with evaluator decision payload', async () => {
        const llmProvider = {
            generateAction: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: {
                    type: ActionType.WAIT,
                    durationMs: 100,
                    thought: 'wait before evaluate'
                }
            }),
            generateEvaluation: vi.fn().mockResolvedValue({
                isErr: () => false,
                value: {
                    decision: 'sub_task_success',
                    summary: 'Goal satisfied',
                    confidence: 0.94,
                    evidence: ['Wait action completed and confirmation condition was met.']
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

        const onEvaluation = vi.fn();

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

        const browser = { getViewportSize: vi.fn().mockResolvedValue({ width: 1200, height: 800 }) };
        const generator = executor.executeStep(
            'run-eval-callback',
            'verify',
            browser as unknown as never,
            'https://example.com',
            0,
            { vision: false, debugScreenshots: false, maxActions: 5, supervisedTerminalPass: false },
            { onEvaluation }
        );

        await generator.next();
        await generator.next();

        expect(onEvaluation).toHaveBeenCalledTimes(1);
        expect(onEvaluation).toHaveBeenCalledWith({
            evaluation: {
                decision: 'sub_task_success',
                summary: 'Goal satisfied',
                confidence: 0.94,
                evidence: ['Wait action completed and confirmation condition was met.']
            },
            attemptedAction: {
                type: ActionType.WAIT,
                durationMs: 100,
                thought: 'wait before evaluate'
            },
            executionOutcome: 'executed'
        });
    });
});
