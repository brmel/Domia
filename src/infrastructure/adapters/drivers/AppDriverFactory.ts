import { injectable, inject } from 'tsyringe';
import type { IAppDriverFactory, IAppDriverProvider, AppDriverCreateConfig } from '../../../domain/ports/IAppDriverFactory';
import type { IAppDriver } from '../../../domain/ports/IAppDriver';
import type { ILogger } from '../../../domain/ports';

/**
 * Registry-based driver factory.
 *
 * Instead of a hardcoded switch, platform-specific providers register
 * themselves at composition time. Adding a new platform (e.g. mobile,
 * SSH) only requires creating a new IAppDriverProvider and registering it.
 */
@injectable()
export class AppDriverFactory implements IAppDriverFactory {
    private readonly providers = new Map<string, IAppDriverProvider>();

    constructor(
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    registerProvider(provider: IAppDriverProvider): void {
        this.logger.debug(`[AppDriverFactory] Registered provider for platform: ${provider.platform}`);
        this.providers.set(provider.platform, provider);
    }

    async createDriver(config: AppDriverCreateConfig): Promise<IAppDriver> {
        const platform = config.platformConfig.platform;
        this.logger.info(`[AppDriverFactory] Creating driver for platform: ${platform}`);

        const provider = this.providers.get(platform);
        if (!provider) {
            const registered = [...this.providers.keys()].join(', ') || '(none)';
            throw new Error(
                `[AppDriverFactory] Unsupported platform: "${platform}". Registered: ${registered}`,
            );
        }

        const driver = await provider.createDriver(config);
        this.logger.debug(`[AppDriverFactory] Driver created and connected`);
        return driver;
    }
}
