import { z } from 'zod';
import { container } from '../../src/composition-root';
import { IPersistenceAdapter } from '../../src/domain/ports';
import { TrajectoryExportService } from '../../src/infrastructure/services/exporters/TrajectoryExportService';
import { t } from './shared';

export const historyRouter = t.router({
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
            const storage = container.resolve<import('../../src/domain/ports/IStorageService').IStorageService>('IStorageService');
            const artifacts = await storage.getStepArtifacts(input.runId, input.stepNumber);
            return artifacts;
        }),
    getStepDetail: t.procedure
        .input(z.object({ runId: z.string(), stepNumber: z.number() }))
        .query(async ({ input }) => {
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const stepsResult = await persistence.getTestSteps(input.runId);
            if (stepsResult.isErr()) throw new Error(stepsResult.error.message);
            const step = stepsResult.value.find(s => s.stepNumber === input.stepNumber);
            return step ?? null;
        }),
    exportTrajectories: t.procedure
        .input(z.object({
            runIds: z.array(z.string().trim().min(1)).optional(),
            workflowDefinitionId: z.string().trim().min(1).optional(),
            from: z.string().datetime().optional(),
            to: z.string().datetime().optional(),
            includeChosenRejected: z.boolean().optional()
        }).optional())
        .mutation(async ({ input }) => {
            const exportService = container.resolve(TrajectoryExportService);
            return exportService.export({
                ...(input?.runIds ? { runIds: input.runIds } : {}),
                ...(input?.workflowDefinitionId ? { workflowDefinitionId: input.workflowDefinitionId } : {}),
                ...(input?.from ? { from: input.from } : {}),
                ...(input?.to ? { to: input.to } : {}),
                ...(input?.includeChosenRejected !== undefined ? { includeChosenRejected: input.includeChosenRejected } : {})
            });
        })
});
