import { z } from 'zod';
import { container } from '../../src/composition-root';
import { ConfigService } from '../../src/infrastructure/config/ConfigService';
import { t } from './shared';

export const settingsRouter = t.router({
    get: t.procedure.query(() => {
        const configService = container.resolve<ConfigService>(ConfigService);
        return configService.get();
    }),
    update: t.procedure
        .input(z.any())
        .mutation(({ input }) => {
            const configService = container.resolve<ConfigService>(ConfigService);
            configService.update(input);
            return { success: true };
        })
});
