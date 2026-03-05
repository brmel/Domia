import { injectable, inject } from 'tsyringe';
import type { IAppDriverProvider, AppDriverCreateConfig } from '@domain/ports/IAppDriverFactory';
import type { IAppDriver } from '@domain/ports/IAppDriver';
import type { ILogger } from '@domain/ports';
import { WebDriver } from './WebDriver';
import { PlaywrightAdapter } from '../playwright/PlaywrightAdapter';
import { BrowserPool } from '../playwright/BrowserPool';

@injectable()
export class WebDriverProvider implements IAppDriverProvider {
    readonly platform = 'web' as const;

    constructor(
        @inject('ILogger') private readonly logger: ILogger,
        @inject(BrowserPool) private readonly pool: BrowserPool,
    ) {}

    async createDriver(config: AppDriverCreateConfig): Promise<IAppDriver> {
        if (config.platformConfig.platform !== 'web') {
            throw new Error('[WebDriverProvider] Invalid platform config');
        }

        const adapter = new PlaywrightAdapter(this.logger, this.pool);
        const driver = new WebDriver(adapter, this.logger);

        // When running inside the Electron desktop app, always keep the browser
        // headless so Playwright does not open a foreign window. The live view
        // displays screenshot frames streamed from the agent instead.
        const runningInElectron = Boolean(
            typeof process !== 'undefined' && process.versions && process.versions['electron']
        );
        const headless = runningInElectron ? true : (config.options?.headless ?? true);

        const connectResult = await driver.connect({ headless });

        if (connectResult.isErr()) {
            throw new Error(`[WebDriverProvider] Connection failed: ${connectResult.error.message}`);
        }

        this.logger.info(`[WebDriverProvider] Connected to: ${config.platformConfig.url}${runningInElectron ? ' (headless, in-app mode)' : ''}`);
        return driver;
    }
}
