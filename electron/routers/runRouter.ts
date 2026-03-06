import { z } from 'zod';
import { container } from '../../src/composition-root';
import { RunUseCase } from '../../src/application/use-cases';
import { IPersistenceAdapter } from '../../src/domain/ports';
import { ExecutionController } from '../../src/application/controllers/ExecutionController';
import { observable } from '@trpc/server/observable';
import { RunInput } from '../../src/application/dtos';
import { configureVerboseTracing } from '../../src/composition/ContainerBuilder';
import { RunInputSchema } from '../../src/shared/validation';
import { RuntimeReadinessPolicyService } from '../../src/application/services/hardening/RuntimeReadinessPolicyService';
import type { RunOutput } from '../../src/application/dtos';
import debug from 'debug';
import { t, eventEmitter, activeRunState } from './shared';

export const runRouter = t.router({
    run: t.procedure
        .input(RunInputSchema)
        .mutation(async ({ input }: { input: z.infer<typeof RunInputSchema> }) => {
            const useCase = container.resolve(RunUseCase);
            if (activeRunState.current) {
                activeRunState.current.stop();
            }
            activeRunState.current = new ExecutionController();
            activeRunState.executionToken += 1;
            const executionToken = activeRunState.executionToken;

            if (input.options?.debug) {
                debug.enable('domia:*');
            }

            if (input.options?.verbose) {
                configureVerboseTracing();
            }

            const generator = useCase.execute(input as RunInput, activeRunState.current);

            (async () => {
                for await (const event of generator) {
                    if (executionToken !== activeRunState.executionToken) break;
                    eventEmitter.emit('test:update', event);
                }
            })().catch(err => {
                if (executionToken !== activeRunState.executionToken) return;
                eventEmitter.emit('test:update', {
                    type: 'error',
                    error: { name: 'Error', message: String(err), code: 'UNKNOWN' }
                });
            }).finally(() => {
                if (executionToken === activeRunState.executionToken) {
                    activeRunState.current = null;
                }
            });

            return { success: true };
        }),

    cancel: t.procedure.mutation(() => {
        if (activeRunState.current) {
            activeRunState.current.stop();
            activeRunState.executionToken += 1;
            activeRunState.current = null;
            return { success: true };
        }
        return { success: false, message: 'No run in progress' };
    }),

    pause: t.procedure.mutation(() => {
        if (activeRunState.current) {
            activeRunState.current.pause();
            return { success: true };
        }
        return { success: false, message: 'No run in progress' };
    }),

    resume: t.procedure.mutation(() => {
        if (activeRunState.current) {
            activeRunState.current.resume();
            return { success: true };
        }
        return { success: false, message: 'No run in progress' };
    }),

    onUpdate: t.procedure.subscription(() => {
        return observable<RunOutput>((emit) => {
            const onUpdate = (data: RunOutput) => {
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
            const runResult = await persistence.getRun(input.runId);

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
