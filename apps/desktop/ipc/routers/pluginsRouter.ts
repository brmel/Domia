import { z } from 'zod';
import { container } from '@backend/container-root';
import { PluginsAppService } from '@backend/plugins/PluginsAppService';
import { t } from './shared';

export const pluginsRouter = t.router({
    list: t.procedure.query(() => container.resolve(PluginsAppService).list()),
    setShellEnabled: t.procedure
        .input(z.object({ enabled: z.boolean() }))
        .mutation(({ input }) => {
            container.resolve(PluginsAppService).setShellEnabled(input.enabled);
            return { success: true };
        }),
});
