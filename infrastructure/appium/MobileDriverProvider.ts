import { inject, injectable } from 'tsyringe';
import type { ILogger } from '@domain/ports';
import type { IAppDriver, AppCapabilities } from '@domain/ports/automation/IAppDriver';
import type { IAppDriverProvider, AppDriverCreateConfig } from '@domain/ports/automation/IAppDriverFactory';
import type { IStructuredAutomation } from '@domain/ports';
import type { IObservationSampler } from '@domain/ports/perception/IObservationSampler';
import type { IObservationStream } from '@domain/ports/perception/IObservationStream';
import { Platform } from '@domain/value-objects';
import { AppiumAdapter } from './AppiumAdapter';
import { AppiumSampler } from './observation/AppiumSampler';
import { AppiumStream } from './observation/AppiumStream';

@injectable()
export class MobileDriverProvider implements IAppDriverProvider {
    readonly platform = Platform.Mobile;

    constructor(@inject('ILogger') private readonly logger: ILogger) {}

    async createDriver(config: AppDriverCreateConfig): Promise<IAppDriver> {
        if (config.platformConfig.platform !== Platform.Mobile) {
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
            platform: Platform.Mobile,
            supportsDOM: false,
            supportsVision: true,
            supportsMultiWindow: false,
            supportsNativeInteraction: true,
        };
    }
    getAutomation(): IStructuredAutomation {
        return this.adapter;
    }
    getSessionExtras(): import('@domain/ports/agent/IAgentRuntime').AgentRuntimeExtras | undefined {
        return undefined;
    }
    createObservationSampler(): IObservationSampler {
        return new AppiumSampler(this.adapter.getPerceptionSource());
    }
    createObservationStream(): IObservationStream {
        return new AppiumStream();
    }
}
