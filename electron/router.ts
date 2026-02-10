import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { container } from '../src/composition-root';
import { RunTestUseCase } from '../src/application/use-cases';
import { IPersistenceAdapter } from '../src/domain/ports';
import { ConfigService } from '../src/infrastructure/config/ConfigService';
import { ExecutionController } from '../src/application/controllers/ExecutionController';
import { observable } from '@trpc/server/observable';
import { EventEmitter } from 'events';
import { RunTestInput } from '../src/application/dtos';
import { FileTraceExporter } from '../src/infrastructure/services/exporters/FileTraceExporter';
// Debug library handling
import debug from 'debug';

const t = initTRPC.create({ isServer: true });

let currentController: ExecutionController | null = null;
const eventEmitter = new EventEmitter();

const runInputSchema = z.object({
    url: z.string(),
    prompt: z.string(),
    options: z.object({
        headless: z.boolean().optional(),
        maxSteps: z.number().optional(),
        provider: z.string().optional(),
        verbose: z.boolean().optional(),
        debug: z.boolean().optional(),
        vision: z.boolean().optional(),
        debugScreenshots: z.boolean().optional()
    }).optional()
});

export const appRouter = t.router({
    test: t.router({
        run: t.procedure
            .input(runInputSchema)
            .mutation(async ({ input }: { input: z.infer<typeof runInputSchema> }) => {
                const useCase = container.resolve<RunTestUseCase>('RunTestUseCase');
                if (currentController) {
                    currentController.stop();
                }
                currentController = new ExecutionController();

                if (input.options?.debug) {
                    debug.enable('domia:*');
                }

                if (input.options?.verbose) {
                    const traceService = container.resolve<import('../src/domain/ports/ITraceService').ITraceService>('ITraceService');
                    const storage = container.resolve<import('../src/domain/ports/IStorageService').IStorageService>('IStorageService');

                    // Cast to concrete TraceService to access addExporter
                    const concreteTrace = traceService as import('../src/infrastructure/services/TraceService').TraceService;
                    if (concreteTrace.addExporter) {
                        concreteTrace.addExporter(new FileTraceExporter(storage));
                    }
                }

                try {
                    const generator = useCase.execute(input as RunTestInput, currentController);

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
                        currentController = null;
                    });

                    return { success: true };
                } catch (error) {
                    return { success: false, error: String(error) };
                }
            }),

        cancel: t.procedure.mutation(() => {
            if (currentController) {
                currentController.stop();
                return { success: true };
            }
            return { success: false, message: 'No test running' };
        }),

        pause: t.procedure.mutation(() => {
            if (currentController) {
                currentController.pause();
                return { success: true };
            }
            return { success: false, message: 'No test running' };
        }),

        resume: t.procedure.mutation(() => {
            if (currentController) {
                currentController.resume();
                return { success: true };
            }
            return { success: false, message: 'No test running' };
        }),

        onUpdate: t.procedure.subscription(() => {
            return observable<{ type: string;[key: string]: any }>((emit) => {
                const onUpdate = (data: any) => {
                    emit.next(data);
                };
                eventEmitter.on('test:update', onUpdate);
                return () => {
                    eventEmitter.off('test:update', onUpdate);
                };
            });
        }),
    }),

    desktop: t.router({
        getSources: t.procedure.query(async () => {
            const { desktopCapturer } = require('electron');
            const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
            return sources.map((source: any) => ({
                id: source.id,
                name: source.name,
                thumbnail: source.thumbnail.toDataURL()
            }));
        })
    }),

    history: t.router({
        getRuns: t.procedure.query(async () => {
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const result = await persistence.getTestRuns();
            if (result.isErr()) throw new Error(result.error.message);
            return result.value;
        }),
        getRun: t.procedure
            .input(z.object({ id: z.string() }))
            .query(async ({ input }: { input: { id: string } }) => {
                const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
                const runResult = await persistence.getTestRun(input.id);
                if (runResult.isErr()) throw new Error(runResult.error.message);
                if (!runResult.value) return null;

                const stepsResult = await persistence.getTestSteps(input.id);
                if (stepsResult.isErr()) throw new Error(stepsResult.error.message);

                return {
                    ...runResult.value,
                    steps: stepsResult.value
                };
            }),
        clear: t.procedure.mutation(async () => {
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const result = await persistence.clearHistory();
            if (result.isErr()) throw new Error(result.error.message);
            return { success: true };
        }),
        getStepArtifacts: t.procedure
            .input(z.object({ runId: z.string(), stepNumber: z.number() }))
            .query(async ({ input }) => {
                const storage = container.resolve<import('../src/domain/ports/IStorageService').IStorageService>('IStorageService');
                const artifacts = await storage.getStepArtifacts(input.runId, input.stepNumber);
                return artifacts;
            })
    }),

    settings: t.router({
        get: t.procedure.query(() => {
            const configService = container.resolve<ConfigService>(ConfigService);
            return configService.get();
        }),
        update: t.procedure
            .input(z.any()) // Validation handled by ConfigService/Zod inside
            .mutation(({ input }) => {
                const configService = container.resolve<ConfigService>(ConfigService);
                configService.update(input);
                return { success: true };
            })
    })
});

export type AppRouter = typeof appRouter;
