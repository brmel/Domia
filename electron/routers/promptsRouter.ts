import { z } from 'zod';
import { container } from '../../src/composition-root';
import { PromptService } from '../../src/infrastructure/prompts/PromptService';
import { t } from './shared';

export const promptsRouter = t.router({
    getAllPrompts: t.procedure.query(() => {
        const service = container.resolve(PromptService);
        return service.getAllPrompts();
    }),

    getAllToolDescriptions: t.procedure.query(() => {
        const service = container.resolve(PromptService);
        return service.getAllToolDescriptions();
    }),

    getOverrides: t.procedure.query(() => {
        const service = container.resolve(PromptService);
        return service.getOverrides();
    }),

    setPrompt: t.procedure
        .input(z.object({ key: z.string(), value: z.string() }))
        .mutation(({ input }) => {
            const service = container.resolve(PromptService);
            service.setPromptOverride(input.key as Parameters<typeof service.setPromptOverride>[0], input.value);
            return { success: true };
        }),

    setToolDescription: t.procedure
        .input(z.object({ toolName: z.string(), value: z.string() }))
        .mutation(({ input }) => {
            const service = container.resolve(PromptService);
            service.setToolDescriptionOverride(input.toolName, input.value);
            return { success: true };
        }),

    resetPrompt: t.procedure
        .input(z.object({ key: z.string() }))
        .mutation(({ input }) => {
            const service = container.resolve(PromptService);
            service.resetPrompt(input.key as Parameters<typeof service.resetPrompt>[0]);
            return { success: true };
        }),

    resetToolDescription: t.procedure
        .input(z.object({ toolName: z.string() }))
        .mutation(({ input }) => {
            const service = container.resolve(PromptService);
            service.resetToolDescription(input.toolName);
            return { success: true };
        }),

    resetAll: t.procedure.mutation(() => {
        const service = container.resolve(PromptService);
        service.resetAll();
        return { success: true };
    }),
});
