import { inject, injectable } from 'tsyringe';
import type { ILogger } from '@domain/ports';
import type { IAppDriver, AppCapabilities } from '@domain/ports/IAppDriver';
import type { IAppDriverProvider, AppDriverCreateConfig } from '@domain/ports/IAppDriverFactory';
import type { IStructuredAutomation } from '@domain/ports';
import { AppiumAdapter } from './AppiumAdapter';

@injectable()
export class MobileDriverProvider implements IAppDriverProvider {
    readonly platform = 'mobile';

    constructor(@inject('ILogger') private readonly logger: ILogger) {}

    async createDriver(config: AppDriverCreateConfig): Promise<IAppDriver> {
        if (config.platformConfig.platform !== 'mobile') {
            throw new Error('[MobileDriverProvider] Invalid platform config');
        }
        const adapter = new AppiumAdapter(this.logger, config.platformConfig);
        return new MobileAppDriver(adapter);
    }
}

class MobileAppDriver implements IAppDriver {
    constructor(private readonly adapter: AppiumAdapter) {}
    connect(): import('neverthrow').ResultAsync<void, Error> {
        return this.adapter.launch({ headless: true }).mapErr((e) => new Error(e.message));
    }
    async disconnect(): Promise<void> {
        await this.adapter.close();
    }
    getCapabilities(): AppCapabilities {
        return {
            platform: 'mobile',
            supportsDOM: false,
            supportsVision: true,
            supportsMultiWindow: false,
            supportsNativeInteraction: true,
        };
    }
    getAutomation(): IStructuredAutomation {
        return this.adapter;
    }
    getSessionExtras(): Readonly<Record<string, unknown>> | undefined {
        return undefined;
    }
}
