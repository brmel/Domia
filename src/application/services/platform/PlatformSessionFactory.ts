import { inject, injectable } from 'tsyringe';
import type { RunInput } from '../../dtos';
import type { ILogger, IStructuredAutomation } from '../../../domain/ports';
import { WorkflowError } from '../../../domain/errors';
import type { IAppDriverFactory, AppDriverCreateOptions } from '../../../domain/ports/IAppDriverFactory';
import type { PlatformSession } from './PlatformSession';

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

        const executionUrl = this.getExecutionUrlFromInput(input);
        const shouldNavigate = platformConfig.platform === 'web';

        return {
            executionUrl,
            shouldNavigate,
            automation,
            driver,
            dispose: async (): Promise<void> => {
                await driver.disconnect().catch((err): void => {
                    this.logger.warn(`[PlatformSessionFactory] Error disconnecting driver: ${String(err)}`);
                });
            }
        };
    }

    private getExecutionUrlFromInput(input: RunInput): string {
        const config = input.platformConfig;

        if (config?.platform === 'web') {
            return config.url;
        }

        if (config?.platform === 'electron') {
            return config.connection.type === 'cdp'
                ? config.connection.cdpUrl
                : 'electron://app';
        }

        if (config?.platform === 'android') {
            return `android://${(config as import('@domain/types/PlatformConfig').AndroidPlatformConfig).appPackage}`;
        }

        if (config?.platform === 'ios') {
            return `ios://${(config as import('@domain/types/PlatformConfig').IosPlatformConfig).bundleId}`;
        }

        // Exhaustive — all PlatformConfig variants handled above
        return `${(config as { platform: string }).platform}://app`;
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
