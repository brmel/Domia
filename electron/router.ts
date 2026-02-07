import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { container } from '../src/composition-root';
import { RunTestUseCase } from '../src/application/use-cases';
import { CancellationTokenSource } from '../src/domain/events';
import { observable } from '@trpc/server/observable';
import { EventEmitter } from 'events';

const t = initTRPC.create({ isServer: true });

let currentCancellation: CancellationTokenSource | null = null;
const eventEmitter = new EventEmitter();

export const appRouter = t.router({
    test: t.router({
        run: t.procedure
            .input(z.object({
                url: z.string(),
                prompt: z.string(),
                options: z.object({
                    headless: z.boolean().optional(),
                    maxSteps: z.number().optional(),
                    provider: z.string().optional()
                }).optional()
            }))
            .mutation(async ({ input }) => {
                console.log('[Router] test.run called with:', JSON.stringify(input));
                const useCase = container.resolve<RunTestUseCase>('RunTestUseCase');
                console.log('[Router] UseCase resolved');
                currentCancellation = new CancellationTokenSource();

                try {
                    const generator = useCase.execute(input, currentCancellation.token);

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
                        currentCancellation = null;
                    });

                    return { success: true };
                } catch (error) {
                    return { success: false, error: String(error) };
                }
            }),

        cancel: t.procedure.mutation(() => {
            if (currentCancellation) {
                currentCancellation.cancel();
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
    })
});

export type AppRouter = typeof appRouter;
