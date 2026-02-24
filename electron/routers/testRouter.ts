import { z } from 'zod';
import { container } from '../../src/composition-root';
import { RunTestUseCase } from '../../src/application/use-cases';
import { IPersistenceAdapter } from '../../src/domain/ports';
import { ExecutionController } from '../../src/application/controllers/ExecutionController';
import { observable } from '@trpc/server/observable';
import { RunTestInput } from '../../src/application/dtos';
import { configureVerboseTracing } from '../../src/composition/modules/registerObservabilityModule';
import { RunInputSchema } from '../../src/shared/validation';
import { AgentActionSchema } from '../../src/shared/validation/agentAction';
import type { AgentAction } from '../../src/domain/value-objects';
import { RuntimeReadinessPolicyService } from '../../src/application/services/hardening/RuntimeReadinessPolicyService';
import type { RunTestOutput } from '../../src/application/dtos';
import debug from 'debug';
import { t, eventEmitter, testControllerState } from './shared';

export const testRouter = t.router({
    run: t.procedure
        .input(RunInputSchema)
        .mutation(async ({ input }: { input: z.infer<typeof RunInputSchema> }) => {
            const useCase = container.resolve<RunTestUseCase>('RunTestUseCase');
            if (testControllerState.current) {
                testControllerState.current.stop();
            }
            testControllerState.current = new ExecutionController();

            if (input.options?.debug) {
                debug.enable('domia:*');
            }

            if (input.options?.verbose) {
                configureVerboseTracing();
            }

            try {
                const generator = useCase.execute(input as RunTestInput, testControllerState.current);

                (async () => {
                    for await (const event of generator) {
                        eventEmitter.emit('test:update', event);
                    }
                })().catch(err => {
                    eventEmitter.emit('test:update', {
                        type: 'error',
                        error: { name: 'Error', message: String(err), code: 'UNKNOWN' }
                    });
                }).finally(() => {
                    testControllerState.current = null;
                });

                return { success: true };
            } catch (error) {
                return { success: false, error: String(error) };
            }
        }),

    cancel: t.procedure.mutation(() => {
        if (testControllerState.current) {
            testControllerState.current.stop();
            return { success: true };
        }
        return { success: false, message: 'No test running' };
    }),

    pause: t.procedure.mutation(() => {
        if (testControllerState.current) {
            testControllerState.current.pause();
            return { success: true };
        }
        return { success: false, message: 'No test running' };
    }),

    resume: t.procedure.mutation(() => {
        if (testControllerState.current) {
            testControllerState.current.resume();
            return { success: true };
        }
        return { success: false, message: 'No test running' };
    }),

    overrideAction: t.procedure
        .input(z.object({ action: AgentActionSchema }))
        .mutation(({ input }) => {
            if (!testControllerState.current) {
                return { success: false, message: 'No test running' };
            }

            testControllerState.current.queueActionOverride(input.action as unknown as AgentAction);
            return { success: true };
        }),

    onUpdate: t.procedure.subscription(() => {
        return observable<RunTestOutput>((emit) => {
            const onUpdate = (data: RunTestOutput) => {
                emit.next(data);
            };
            eventEmitter.on('test:update', onUpdate);
            return () => {
                eventEmitter.off('test:update', onUpdate);
            };
        });
    }),

    getCheckpoints: t.procedure
        .input(z.object({ runId: z.string() }))
        .query(async ({ input }) => {
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const checkpointsResult = await persistence.getCheckpointRecords(input.runId);

            if (checkpointsResult.isErr()) {
                throw new Error(checkpointsResult.error.message);
            }

            return checkpointsResult.value;
        }),

    getReadiness: t.procedure
        .input(z.object({ runId: z.string() }))
        .query(async ({ input }) => {
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const runResult = await persistence.getTestRun(input.runId);

            if (runResult.isErr()) {
                throw new Error(runResult.error.message);
            }

            const run = runResult.value;
            if (!run) {
                throw new Error(`Run not found: ${input.runId}`);
            }

            const readinessPolicy = container.resolve(RuntimeReadinessPolicyService);
            const decision = readinessPolicy.assess(
                {
                    prompt: run.prompt,
                    options: {}
                },
                run.url
            );

            return {
                runId: run.id,
                ...decision
            };
        }),
});
