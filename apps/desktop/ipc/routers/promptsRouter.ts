import { z } from 'zod';
import { container } from '@backend/container-root';
import { PromptsAppService } from '@backend/prompts/PromptsAppService';
import { t } from './shared';

export const promptsRouter = t.router({
    getAllPrompts: t.procedure.query(() => {
        const service = container.resolve(PromptsAppService);
        return service.getAllPrompts();
    }),

    getAllToolDescriptions: t.procedure.query(() => {
        const service = container.resolve(PromptsAppService);
        return service.getAllToolDescriptions();
    }),

    getOverrides: t.procedure.query(() => {
        const service = container.resolve(PromptsAppService);
        return service.getOverrides();
    }),

    setPrompt: t.procedure
        .input(z.object({ key: z.string(), value: z.string() }))
        .mutation(({ input }) => {
            const service = container.resolve(PromptsAppService);
            service.setPrompt(input.key as Parameters<typeof service.setPrompt>[0], input.value);
            return { success: true };
        }),

    setToolDescription: t.procedure
        .input(z.object({ toolName: z.string(), value: z.string() }))
        .mutation(({ input }) => {
            const service = container.resolve(PromptsAppService);
            service.setToolDescription(input.toolName, input.value);
            return { success: true };
        }),

    resetPrompt: t.procedure
        .input(z.object({ key: z.string() }))
        .mutation(({ input }) => {
            const service = container.resolve(PromptsAppService);
            service.resetPrompt(input.key as Parameters<typeof service.resetPrompt>[0]);
            return { success: true };
        }),

    resetToolDescription: t.procedure
        .input(z.object({ toolName: z.string() }))
        .mutation(({ input }) => {
            const service = container.resolve(PromptsAppService);
            service.resetToolDescription(input.toolName);
            return { success: true };
        }),

    resetAll: t.procedure.mutation(() => {
        const service = container.resolve(PromptsAppService);
        service.resetAll();
        return { success: true };
    }),
});
