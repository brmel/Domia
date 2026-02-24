import { injectable, inject } from 'tsyringe';
import type { IAppDriverProvider, AppDriverCreateConfig } from '@domain/ports/IAppDriverFactory';
import type { IAppDriver } from '@domain/ports/IAppDriver';
import type { ILogger } from '@domain/ports';
import { WebDriver } from './WebDriver';

@injectable()
export class WebDriverProvider implements IAppDriverProvider {
    readonly platform = 'web' as const;

    constructor(
        @inject(WebDriver) private readonly webDriver: WebDriver,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    async createDriver(config: AppDriverCreateConfig): Promise<IAppDriver> {
        if (config.platformConfig.platform !== 'web') {
            throw new Error('[WebDriverProvider] Invalid platform config');
        }

        const driver = this.webDriver;
        const connectResult = await driver.connect({
            headless: config.options?.headless ?? true,
        });

        if (connectResult.isErr()) {
            throw new Error(`[WebDriverProvider] Connection failed: ${connectResult.error.message}`);
        }

        this.logger.info(`[WebDriverProvider] Connected to: ${config.platformConfig.url}`);
        return driver;
    }
}
