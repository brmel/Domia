import { injectable, inject } from 'tsyringe';
import type { IAppDriverProvider, AppDriverCreateConfig } from '@domain/ports/IAppDriverFactory';
import type { IAppDriver } from '@domain/ports/IAppDriver';
import type { ILogger, IConfigService } from '@domain/ports';
import { WebDriver } from './WebDriver';
import { PlaywrightAdapter } from '../playwright/PlaywrightAdapter';
import { BrowserPool } from '../playwright/BrowserPool';
import { ELECTRON_DEBUG_PORT } from '@shared/defaults';

const AGENT_VIEW_MARKER = 'domia-agent-view';

@injectable()
export class WebDriverProvider implements IAppDriverProvider {
    readonly platform = 'web' as const;

    constructor(
        @inject('ILogger') private readonly logger: ILogger,
        @inject(BrowserPool) private readonly pool: BrowserPool,
        @inject('IConfigService') private readonly configService: IConfigService,
    ) {}

    async createDriver(config: AppDriverCreateConfig): Promise<IAppDriver> {
        if (config.platformConfig.platform !== 'web') {
            throw new Error('[WebDriverProvider] Invalid platform config');
        }

        const viewMode = this.configService.get().viewMode ?? 'embedded';
        // Embedded mode attaches to the desktop app's agent WebContentsView (CDP on
        // ELECTRON_DEBUG_PORT). That view only exists in the real Electron renderer host —
        // NOT when the CLI runs via ELECTRON_RUN_AS_NODE=1 (electron-as-node), where
        // process.versions.electron is still set but there is no agent view. Excluding it
        // keeps the CLI on a standalone launched browser.
        const isElectronHost = typeof process !== 'undefined'
            && !!process.versions?.['electron']
            && process.env['ELECTRON_RUN_AS_NODE'] !== '1';

        if (viewMode === 'embedded' && isElectronHost) {
            return this.createEmbeddedDriver();
        }

        return this.createDetachedDriver(config);
    }

    private async createEmbeddedDriver(): Promise<IAppDriver> {
        const { chromium } = await import('playwright');
        const debugPort = process.env['ELECTRON_REMOTE_DEBUGGING_PORT'] || ELECTRON_DEBUG_PORT;
        const cdpUrl = `http://127.0.0.1:${debugPort}`;

        this.logger.info(`[WebDriverProvider] Connecting to own CDP at ${cdpUrl} (embedded mode)`);
        const browser = await chromium.connectOverCDP(cdpUrl);

        const allPages = browser.contexts().flatMap(c => c.pages());
        const agentPage = allPages.find(p => p.url().includes(AGENT_VIEW_MARKER));
        if (!agentPage) {
            await browser.close();
            throw new Error('[WebDriverProvider] Agent view page not found — is the WebContentsView created?');
        }

        const adapter = new PlaywrightAdapter(this.logger);
        adapter.setAttachedPage(agentPage);
        const driver = new WebDriver(adapter, this.logger);

        this.logger.info('[WebDriverProvider] Attached to agent view (embedded mode)');
        return driver;
    }

    private async createDetachedDriver(config: AppDriverCreateConfig): Promise<IAppDriver> {
        const adapter = new PlaywrightAdapter(this.logger, this.pool);
        const driver = new WebDriver(adapter, this.logger);
        const headless = config.options?.headless ?? true;
        const device = config.platformConfig.platform === 'web' ? config.platformConfig.device : undefined;

        const connectResult = await driver.connect({ headless, ...(device ? { device } : {}) });
        if (connectResult.isErr()) {
            throw new Error(`[WebDriverProvider] Connection failed: ${connectResult.error.message}`);
        }

        this.logger.info(`[WebDriverProvider] Connected (detached, headless=${headless})`);
        return driver;
    }
}
