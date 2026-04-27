import { z } from 'zod';
import { container } from '@backend/container-root';
import { SkillsAppService } from '@backend/skills/SkillsAppService';
import { SkillExtractionService } from '@backend/skills/SkillExtractionService';
import { SkillIdFactory } from '@domain/value-objects';
import { t } from './shared';

export const skillsRouter = t.router({
    list: t.procedure.query(async () => {
        const skills = container.resolve(SkillsAppService);
        return skills.list();
    }),

    get: t.procedure
        .input(z.object({ id: z.string().min(1) }))
        .query(async ({ input }) => {
            const skills = container.resolve(SkillsAppService);
            return skills.get(input.id);
        }),

    createFromRun: t.procedure
        .input(z.object({
            name: z.string().trim().min(1),
            description: z.string().trim().default(''),
            runId: z.string().min(1),
        }))
        .mutation(async ({ input }) => {
            const skills = container.resolve(SkillsAppService);
            const extractor = container.resolve(SkillExtractionService);
            const steps = await extractor.fromRun(input.runId);
            return skills.create({
                name: input.name,
                description: input.description,
                steps,
                createdFromRunId: input.runId,
            });
        }),

    delete: t.procedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ input }) => {
            const skills = container.resolve(SkillsAppService);
            await skills.delete(SkillIdFactory.create(input.id));
            return { success: true };
        }),
});
