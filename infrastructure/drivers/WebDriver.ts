import { ResultAsync } from 'neverthrow';
import { IAppDriver, AppCapabilities } from '@domain/ports/IAppDriver';
import { PlaywrightAdapter } from '../playwright/PlaywrightAdapter';
import type { ILogger } from '@domain/ports';

export class WebDriver implements IAppDriver {
    constructor(
        private readonly playwright: PlaywrightAdapter,
        private readonly logger: ILogger
    ) { }

    connect(config?: { headless?: boolean }): ResultAsync<void, Error> {
        this.logger.debug('[WebDriver] Connecting via PlaywrightAdapter');
        const headless = config?.headless ?? true;
        return this.playwright.launch({ headless })
            .mapErr((e: Error) => new Error(`WebDriver connect failed: ${e.message}`));
    }

    async disconnect(): Promise<void> {
        await this.playwright.close();
    }

    getCapabilities(): AppCapabilities {
        return {
            platform: 'web',
            supportsDOM: true,
            supportsVision: true,
            supportsMultiWindow: false,
            supportsNativeInteraction: false
        };
    }

    getAutomation(): import('@domain/ports').IStructuredAutomation {
        return this.playwright;
    }

    getSessionExtras(): Readonly<Record<string, unknown>> | undefined {
        return undefined;
    }
}
