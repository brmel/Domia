import { inject, injectable } from 'tsyringe';
import type { RunInput } from '@backend/dto';
import type { ILogger, IStructuredAutomation } from '@domain/ports';
import { WorkflowError } from '@domain/errors';
import type { IAppDriverFactory, AppDriverCreateOptions } from '@domain/ports/automation/IAppDriverFactory';
import type { PlatformSession } from './PlatformSession';
import { resolveUrlFromConfig } from './platformUrlUtils';

@injectable()
export class PlatformSessionFactory {
    constructor(
        @inject('IAppDriverFactory') private readonly driverFactory: IAppDriverFactory,
        @inject('ILogger') private readonly logger: ILogger
    ) {}

    async createSession(input: RunInput): Promise<PlatformSession> {
        return this.createPlatformSession(input);
    }

    private async createPlatformSession(input: RunInput): Promise<PlatformSession> {
        const platformConfig = input.platformConfig;

        this.logger.info(`[PlatformSessionFactory] Creating session for platform: ${platformConfig.platform}`);

        const driverOptions = this.toDriverOptions(input.options);

        const driver = await this.driverFactory.createDriver({
            platformConfig,
            ...(driverOptions ? { options: driverOptions } : {})
        });

        let automation: IStructuredAutomation;

        try {
            automation = driver.getAutomation();
        } catch (error) {
            await driver.disconnect().catch(() => undefined);
            const message = error instanceof Error ? error.message : String(error);
            throw new WorkflowError(`Driver is connected but automation bridge is unavailable: ${message}`);
        }

        const executionUrl = resolveUrlFromConfig(input.platformConfig);
        const shouldNavigate = platformConfig.platform === 'web'
            || (platformConfig.platform === 'electron' && 'startUrl' in platformConfig && !!platformConfig.startUrl);

        const extras = driver.getSessionExtras();
        // Surface capabilities so the tool catalog can gate by them.
        const extrasWithCapabilities = { ...(extras ?? {}), capabilities: driver.getCapabilities() };

        return {
            executionUrl,
            shouldNavigate,
            automation,
            driver,
            extras: extrasWithCapabilities,
            createObservationSampler: (deps) => driver.createObservationSampler(deps),
            createObservationStream: () => driver.createObservationStream(),
            dispose: async (): Promise<void> => {
                await driver.disconnect().catch((err): void => {
                    this.logger.warn(`[PlatformSessionFactory] Error disconnecting driver: ${String(err)}`);
                });
            }
        };
    }

    private toDriverOptions(options: RunInput['options']): AppDriverCreateOptions | undefined {
        if (!options) {
            return undefined;
        }

        const driverOptions: AppDriverCreateOptions = {
            ...(options.headless !== undefined ? { headless: options.headless } : {}),
            ...(options.maxSteps !== undefined ? { maxSteps: options.maxSteps } : {}),
            ...(options.vision !== undefined ? { vision: options.vision } : {}),
            ...(options.debugScreenshots !== undefined ? { debugScreenshots: options.debugScreenshots } : {})
        };

        return Object.keys(driverOptions).length > 0 ? driverOptions : undefined;
    }
}
