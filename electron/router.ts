import { t } from './routers/shared';
import { runRouter } from './routers/runRouter';
import { historyRouter } from './routers/historyRouter';
import { workflowRouter } from './routers/workflowRouter';
import { settingsRouter } from './routers/settingsRouter';
import { promptsRouter } from './routers/promptsRouter';

export const appRouter = t.router({
    run: runRouter,
    history: historyRouter,
    workflow: workflowRouter,
    settings: settingsRouter,
    prompts: promptsRouter,
});

export type AppRouter = typeof appRouter;
