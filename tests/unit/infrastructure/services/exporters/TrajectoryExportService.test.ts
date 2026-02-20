import 'reflect-metadata';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { describe, expect, it, vi } from 'vitest';
import { ActionType } from '@domain/enums/ActionType';
import { TrajectoryExportService } from '@infrastructure/services/exporters/TrajectoryExportService';

function createServiceContext(): {
    service: TrajectoryExportService;
    persistence: Record<string, unknown>;
    storage: Record<string, unknown>;
    tempRoot: string;
} {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'domia-trajectory-export-'));

    const persistence = {
        getTestRuns: vi.fn().mockResolvedValue({
            isErr: () => false,
            value: [
                {
                    id: 'run-1',
                    url: 'https://example.com',
                    prompt: 'validate checkout',
                    startedAt: new Date('2026-02-10T00:00:00.000Z')
                },
                {
                    id: 'run-2',
                    url: 'https://example.org',
                    prompt: 'validate profile',
                    startedAt: new Date('2026-02-11T00:00:00.000Z')
                }
            ]
        }),
        getTestRun: vi.fn(async (runId: string): Promise<{ isErr: () => false; value: { id: string; url: string; prompt: string; startedAt: Date } }> => ({
            isErr: () => false,
            value: {
                id: runId,
                url: runId === 'run-1' ? 'https://example.com' : 'https://example.org',
                prompt: runId === 'run-1' ? 'validate checkout' : 'validate profile',
                startedAt: new Date('2026-02-10T00:00:00.000Z')
            }
        })),
        getTestSteps: vi.fn(async (runId: string): Promise<{ isErr: () => false; value: Array<{ id: string; testRunId: string; stepNumber: number; actionType: ActionType; actionPayload: { type: ActionType; elementId: number; thought: string }; timestamp: string }> }> => ({
            isErr: () => false,
            value: [
                {
                    id: `${runId}-step-1`,
                    testRunId: runId,
                    stepNumber: 1,
                    actionType: ActionType.CLICK,
                    actionPayload: {
                        type: ActionType.CLICK,
                        elementId: 1,
                        thought: `final-action-${runId}`
                    },
                    timestamp: new Date().toISOString()
                }
            ]
        })),
        getWorkflowRuns: vi.fn().mockResolvedValue({
            isErr: () => false,
            value: [
                {
                    id: 'workflow-run-1',
                    workflowDefinitionId: 'workflow-def-1'
                }
            ]
        }),
        getWorkflowStepRuns: vi.fn().mockResolvedValue({
            isErr: () => false,
            value: [
                {
                    id: 'workflow-step-1',
                    workflowRunId: 'workflow-run-1',
                    testRunId: 'run-1'
                }
            ]
        })
    };

    const storage = {
        getStepArtifacts: vi.fn(async (runId: string): Promise<Record<string, unknown>> => {
            if (runId !== 'run-1') {
                return {
                    trace: {
                        events: []
                    }
                };
            }

            return {
                trace: {
                    agentInput: {
                        promptPreview: 'Prompt preview',
                        timelineSummary: 'Timeline summary'
                    },
                    events: [
                        {
                            timestamp: Date.now(),
                            agentOutput: {
                                action: {
                                    type: ActionType.CLICK,
                                    elementId: 1,
                                    thought: 'model proposal'
                                },
                                rawResponse: JSON.stringify({
                                    type: ActionType.CLICK,
                                    elementId: 1,
                                    thought: 'model proposal'
                                })
                            }
                        },
                        {
                            timestamp: Date.now(),
                            agentOutput: {
                                action: {
                                    type: ActionType.MOUSE_CLICK_LEFT,
                                    x: 100,
                                    y: 200,
                                    thought: 'operator correction'
                                },
                                rawResponse: 'operator-action-override'
                            }
                        },
                        {
                            timestamp: Date.now(),
                            agentOutput: {
                                rawResponse: JSON.stringify({
                                    decision: 'sub_task_success',
                                    summary: 'step succeeded',
                                    advice: 'continue'
                                })
                            }
                        }
                    ]
                }
            };
        })
    };

    const configService = {
        get: vi.fn(() => ({
            paths: {
                artifactsDir: tempRoot
            }
        }))
    };

    const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        error: vi.fn()
    };

    return {
        service: new TrajectoryExportService(persistence as unknown as never, storage as unknown as never, configService as unknown as never, logger as unknown as never),
        persistence,
        storage,
        tempRoot
    };
}

describe('TrajectoryExportService', () => {
    it('exports filtered trajectories and includes chosen/rejected records by default', async () => {
        const context = createServiceContext();

        const result = await context.service.export({
            workflowDefinitionId: 'workflow-def-1'
        });

        expect(result.exportedCount).toBe(1);
        expect(await fs.pathExists(result.filePath)).toBe(true);

        const json = await fs.readJson(result.filePath);
        expect(json.trajectories).toHaveLength(1);
        expect(json.trajectories[0].modelProposal).toBeDefined();
        expect(json.trajectories[0].operatorCorrection).toBeDefined();
        expect(json.trajectories[0].evaluatorOutcome.decision).toBe('sub_task_success');
    });

    it('omits chosen/rejected records when requested', async () => {
        const context = createServiceContext();

        const result = await context.service.export({
            runIds: ['run-1'],
            includeChosenRejected: false
        });

        const json = await fs.readJson(result.filePath);
        expect(json.trajectories).toHaveLength(1);
        expect(json.trajectories[0].modelProposal).toBeUndefined();
        expect(json.trajectories[0].operatorCorrection).toBeUndefined();
    });
});
