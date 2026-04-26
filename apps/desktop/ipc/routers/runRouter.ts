import { z } from 'zod';
import { container } from '@backend/container-root';
import { RunUseCase } from '@backend/runs';
import { IPersistenceAdapter } from '@domain/ports';
import { ExecutionController } from '@backend/ExecutionController';
import { observable } from '@trpc/server/observable';
import { RunInput } from '@backend/dto';
import { RunInputSchema } from '@shared/contracts/run';
import { RuntimeReadinessPolicyService } from '@backend/policy/RuntimeReadinessPolicyService';
import { RunReportingService } from '@backend/runs/RunReportingService';
import type { RunOutput } from '@backend/dto';
import debug from 'debug';
import { t, eventEmitter, activeRunState } from './shared';
import { serializeRunOutput } from './serializeRunOutput';

export const runRouter = t.router({
    run: t.procedure
        .input(RunInputSchema)
        .mutation(async ({ input }: { input: z.infer<typeof RunInputSchema> }) => {
            const useCase = container.resolve(RunUseCase);
            if (activeRunState.current) {
                activeRunState.current.stop();
            }
            activeRunState.current = new ExecutionController();
            activeRunState.current.start();
            activeRunState.executionToken += 1;
            const executionToken = activeRunState.executionToken;

            if (input.options?.debug) {
                debug.enable('domia:*');
            }

            const generator = useCase.execute(input as RunInput, activeRunState.current);

            (async () => {
                for await (const event of generator) {
                    if (executionToken !== activeRunState.executionToken) break;
                    eventEmitter.emit('test:update', serializeRunOutput(event));
                }
            })().catch(err => {
                console.error('[runRouter] Unhandled generator error:', err);
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

    generateReport: t.procedure
        .input(z.object({
            runId: z.string(),
            formats: z.array(z.enum(['junit', 'html'])).min(1),
            outputDir: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            const reporting = container.resolve(RunReportingService);
            const files = await reporting.write(input.runId, input.formats, input.outputDir);
            return { files };
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
