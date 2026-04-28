import { container } from '@backend/container-root';
import { SettingsAppService } from '@backend/settings/SettingsAppService';
import { DomiaConfigSchema } from '@shared/contracts/config';
import { t } from './shared';

export const settingsRouter = t.router({
    get: t.procedure.query(() => {
        const settingsService = container.resolve(SettingsAppService);
        return settingsService.get();
    }),
    update: t.procedure
        .input(DomiaConfigSchema)
        .mutation(({ input }) => {
            const settingsService = container.resolve(SettingsAppService);
            settingsService.update(input);
            return { success: true };
        })
});
