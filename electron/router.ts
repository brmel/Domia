import { t } from './routers/shared';
import { runRouter } from './routers/runRouter';
import { desktopRouter } from './routers/desktopRouter';
import { historyRouter } from './routers/historyRouter';
import { workflowRouter } from './routers/workflowRouter';
import { settingsRouter } from './routers/settingsRouter';

export const appRouter = t.router({
    run: runRouter,
    desktop: desktopRouter,
    history: historyRouter,
    workflow: workflowRouter,
    settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
