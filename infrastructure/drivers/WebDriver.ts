import { ResultAsync } from 'neverthrow';
import type { IAppDriver, AppCapabilities, ObservationFactoryDeps } from '@domain/ports/automation/IAppDriver';
import type { IObservationSampler } from '@domain/ports/perception/IObservationSampler';
import type { IObservationStream } from '@domain/ports/perception/IObservationStream';
import { PlaywrightAdapter } from '../playwright/PlaywrightAdapter';
import { PlaywrightSampler } from '../playwright/observation/PlaywrightSampler';
import { PlaywrightStream } from '../playwright/observation/PlaywrightStream';
import type { ILogger } from '@domain/ports';

export class WebDriver implements IAppDriver {
    constructor(
        private readonly playwright: PlaywrightAdapter,
        private readonly logger: ILogger
    ) { }

    connect(config?: { headless?: boolean; device?: string }): ResultAsync<void, Error> {
        this.logger.debug('[WebDriver] Connecting via PlaywrightAdapter');
        const headless = config?.headless ?? true;
        return this.playwright.launch({ headless, ...(config?.device ? { device: config.device } : {}) })
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

    getSessionExtras(): import('@domain/ports/agent/IAgentRuntime').AgentRuntimeExtras | undefined {
        return { tabManager: this.playwright };
    }

    createObservationSampler(deps: ObservationFactoryDeps): IObservationSampler {
        const source = this.playwright.getPerceptionSource();
        if (!source) throw new Error('[WebDriver] Cannot create sampler before page is open');
        return new PlaywrightSampler(deps.perception, source, deps.vision);
    }

    createObservationStream(): IObservationStream {
        return new PlaywrightStream(() => this.playwright.getPlaywrightPage(), this.logger);
    }
}
