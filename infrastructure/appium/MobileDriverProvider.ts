import { inject, injectable } from 'tsyringe';
import type { ILogger } from '@domain/ports';
import type { IAppDriver, AppCapabilities } from '@domain/ports/IAppDriver';
import type { IAppDriverProvider, AppDriverCreateConfig } from '@domain/ports/IAppDriverFactory';
import type { IStructuredAutomation } from '@domain/ports';
import type { IObservationSampler } from '@domain/ports/IObservationSampler';
import type { IObservationStream } from '@domain/ports/IObservationStream';
import { AppiumAdapter } from './AppiumAdapter';
import { AppiumSampler } from './observation/AppiumSampler';
import { AppiumStream } from './observation/AppiumStream';

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
    createObservationSampler(): IObservationSampler {
        return new AppiumSampler();
    }
    createObservationStream(): IObservationStream {
        return new AppiumStream();
    }
}
