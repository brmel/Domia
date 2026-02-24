import { t } from './routers/shared';
import { testRouter } from './routers/testRouter';
import { desktopRouter } from './routers/desktopRouter';
import { historyRouter } from './routers/historyRouter';
import { workflowRouter } from './routers/workflowRouter';
import { settingsRouter } from './routers/settingsRouter';

export const appRouter = t.router({
    test: testRouter,
    desktop: desktopRouter,
    history: historyRouter,
    workflow: workflowRouter,
    settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
