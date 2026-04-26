import { z } from 'zod';
import { container } from '@backend/container-root';
import { RunQueries } from '@backend/runs/RunQueries';
import { t } from './shared';

export const historyRouter = t.router({
    getRuns: t.procedure.query(() => container.resolve(RunQueries).listRuns()),
    getRun: t.procedure
        .input(z.object({ id: z.string() }))
        .query(({ input }) => container.resolve(RunQueries).getRunWithSteps(input.id)),
    clear: t.procedure.mutation(async () => {
        await container.resolve(RunQueries).clearHistory();
        return { success: true };
    }),
    getStepArtifacts: t.procedure
        .input(z.object({ runId: z.string(), stepNumber: z.number() }))
        .query(({ input }) => container.resolve(RunQueries).getStepArtifacts(input.runId, input.stepNumber)),
    getStepDetail: t.procedure
        .input(z.object({ runId: z.string(), stepNumber: z.number() }))
        .query(({ input }) => container.resolve(RunQueries).getStepDetail(input.runId, input.stepNumber)),
});
