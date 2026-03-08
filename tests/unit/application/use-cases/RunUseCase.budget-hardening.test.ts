import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { RunOutput } from '@application/dtos';
import { ExecutionController } from '@application/ExecutionController';
import { ActionType } from '@domain/enums';
import { createRunUseCaseContext } from '../../../helpers/createRunUseCaseContext';

describe('RunUseCase budget hardening', () => {
    it('terminates run with workflow error when budget is exceeded', async () => {
        const ctx = createRunUseCaseContext({
            runId: 'run-budget',
            executor: {
                executeStep: vi.fn(async function* () {
                    yield {
                        type: 'action' as const,
                        action: { type: ActionType.WAIT, durationMs: 10, thought: 'wait' },
                        actionIndex: 0,
                        trace: {},
                    };
                    return { success: true as const, terminal: 'pass' as const };
                }),
            },
            budgetPolicy: {
                resolveLimits: vi.fn().mockReturnValue({
                    maxActions: 0,
                    maxDurationMs: 999999,
                    maxEstimatedTokens: 999999,
                }),
                assess: vi.fn().mockReturnValue({ status: 'exceeded', exceeded: ['actions'] }),
                evaluate: vi.fn().mockReturnValue({ status: 'exceeded', exceeded: ['actions'] }),
                formatExceededMessage: vi.fn().mockReturnValue(
                    'Run budget exceeded (actions). actions=1/0, durationMs=1/999999, tokens=10/999999, retries=0/0',
                ),
            },
        });

        const events: RunOutput[] = [];
        for await (const event of ctx.useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'budget enforce run',
            options: { maxSteps: 1 },
        }, new ExecutionController())) {
            events.push(event);
        }

        expect(events.some(event => event.type === 'error')).toBe(true);
        expect(ctx.lifecycleManager.failRun).toHaveBeenCalled();
    });
});
