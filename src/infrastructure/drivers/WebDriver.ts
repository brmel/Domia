import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { IAppDriver, AppCapabilities } from '../../domain/ports/IAppDriver';
import { PlaywrightAdapter } from '../browser/PlaywrightAdapter';
import type { ILogger } from '../../domain/ports';
import { Platform } from '../../domain/constants/PlatformConstants';

@injectable()
export class WebDriver implements IAppDriver {
    constructor(
        @inject(PlaywrightAdapter) private playwright: PlaywrightAdapter,
        @inject('ILogger') private logger: ILogger
    ) { }

    connect(config?: { headless?: boolean }): ResultAsync<void, Error> {
        this.logger.debug('[WebDriver] Connecting via PlaywrightAdapter');
        const headless = config?.headless ?? true;
        return this.playwright.launch({ headless })
            .mapErr(e => new Error(`WebDriver connect failed: ${e.message}`));
    }

    async disconnect(): Promise<void> {
        await this.playwright.close();
    }

    getCapabilities(): AppCapabilities {
        return {
            platform: Platform.WEB,
            supportsDOM: true,
            supportsVision: true,
            supportsMultiWindow: false,
            supportsNativeInteraction: false
        };
    }

    getBrowserAutomation(): import('../../domain/ports').IBrowserAutomation {
        return this.playwright;
    }
}
