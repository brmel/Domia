import { inject, injectable } from 'tsyringe';
import type { RunTestInput } from '../../dtos';
import type { ILogger, IAppAutomation } from '../../../domain/ports';
import { WorkflowError } from '../../../domain/errors';
import type { IAppDriverFactory, AppDriverCreateOptions } from '../../../domain/ports/IAppDriverFactory';
import type { PlatformSession } from './PlatformSession';

@injectable()
export class PlatformSessionFactory {
    constructor(
        @inject('IAppDriverFactory') private readonly driverFactory: IAppDriverFactory,
        @inject('ILogger') private readonly logger: ILogger
    ) {}

    async createSession(input: RunTestInput): Promise<PlatformSession> {
        return this.createPlatformSession(input);
    }

    private async createPlatformSession(input: RunTestInput): Promise<PlatformSession> {
        const platformConfig = input.platformConfig;

        this.logger.info(`[PlatformSessionFactory] Creating session for platform: ${platformConfig.platform}`);

        const driverOptions = this.toDriverOptions(input.options);

        const driver = await this.driverFactory.createDriver({
            platformConfig,
            ...(driverOptions ? { options: driverOptions } : {})
        });

        let automation: IAppAutomation;

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

    private getExecutionUrlFromInput(input: RunTestInput): string {
        if (input.platformConfig?.platform === 'web') {
            return input.platformConfig.url;
        }

        if (input.platformConfig?.platform === 'electron') {
            return input.platformConfig.connection.type === 'cdp'
                ? input.platformConfig.connection.cdpUrl
                : 'electron://app';
        }

        throw new WorkflowError('Unable to resolve execution URL from provided input');
    }

    private toDriverOptions(options: RunTestInput['options']): AppDriverCreateOptions | undefined {
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
