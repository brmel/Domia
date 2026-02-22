import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ExecutionController } from '@application/controllers/ExecutionController';
import { ActionType } from '@domain/enums/ActionType';
import { createRunTestUseCaseContext } from '../../../helpers/createRunTestUseCaseContext';

describe('RunTestUseCase no-plan behavior', () => {
    it('does not invoke planner or replanning after failed step', async () => {
        let executionCount = 0;

        const ctx = createRunTestUseCaseContext({
            runId: 'run-replan-advice',
            executor: {
                executeStep: vi.fn(async function* () {
                    executionCount += 1;

                    if (executionCount === 1) {
                        yield {
                            type: 'action' as const,
                            action: { type: ActionType.FAIL, reason: 'could not verify', thought: 'failing this attempt' },
                            assets: {},
                        };
                        return {
                            success: false as const,
                            terminal: 'fail' as const,
                            code: 'agent_fail' as const,
                            reason: 'could not verify',
                        };
                    }

                    yield {
                        type: 'action' as const,
                        action: { type: ActionType.PASS, summary: 'done', thought: 'done' },
                        assets: {},
                    };
                    return { success: true as const, terminal: 'pass' as const };
                }),
            },
        });

        const controller = new ExecutionController();
        const events: Array<{ type: string; [key: string]: unknown }> = [];
        for await (const event of ctx.useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'do the task',
            options: { maxSteps: 5 },
        }, controller)) {
            events.push(event as unknown as { type: string; [key: string]: unknown });
        }

        expect(ctx.executor.executeStep).toHaveBeenCalledTimes(1);
        expect(events.some((event) => event.type === 'completed')).toBe(true);
        const completed = events.find((event) => event.type === 'completed');
        expect(completed?.['success']).toBe(false);
    });
});
