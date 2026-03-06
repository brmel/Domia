import { container } from '../../src/composition-root';
import { ConfigService } from '../../src/infrastructure/config/ConfigService';
import { DomiaConfigSchema } from '../../src/shared/config-types';
import { t } from './shared';

export const settingsRouter = t.router({
    get: t.procedure.query(() => {
        const configService = container.resolve<ConfigService>(ConfigService);
        return configService.get();
    }),
    update: t.procedure
        .input(DomiaConfigSchema)
        .mutation(({ input }) => {
            const configService = container.resolve<ConfigService>(ConfigService);
            configService.update(input);
            return { success: true };
        })
});
