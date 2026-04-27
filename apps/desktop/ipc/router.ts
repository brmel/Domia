import { t } from './routers/shared';
import { runRouter } from './routers/runRouter';
import { historyRouter } from './routers/historyRouter';
import { workflowRouter } from './routers/workflowRouter';
import { settingsRouter } from './routers/settingsRouter';
import { promptsRouter } from './routers/promptsRouter';
import { pluginsRouter } from './routers/pluginsRouter';
import { skillsRouter } from './routers/skillsRouter';

export const appRouter = t.router({
    run: runRouter,
    history: historyRouter,
    workflow: workflowRouter,
    settings: settingsRouter,
    prompts: promptsRouter,
    plugins: pluginsRouter,
    skills: skillsRouter,
});

export type AppRouter = typeof appRouter;
