import { inject, injectable } from 'tsyringe';
import type { RunTestInput } from '../../dtos';
import type { ILogger, IBrowserAutomation } from '../../../domain/ports';
import type { INode } from '../../../domain/ports';
import { WorkflowError } from '../../../domain/errors';
import { AppDriverFactory } from '../../../infrastructure/adapters/drivers/AppDriverFactory';
import { DomiaGateway } from '../../gateway/DomiaGateway';
import type { PlatformSession } from './PlatformSession';

@injectable()
export class PlatformSessionFactory {
    constructor(
        @inject(AppDriverFactory) private readonly driverFactory: AppDriverFactory,
        @inject(DomiaGateway) private readonly gateway: DomiaGateway,
        @inject('ILogger') private readonly logger: ILogger
    ) {}

    async createSession(input: RunTestInput, testRunId: string): Promise<PlatformSession> {
        if (input.platformConfig) {
            return this.createPlatformSession(input);
        }

        return this.createLegacyWebSession(input, testRunId);
    }

    private async createPlatformSession(input: RunTestInput): Promise<PlatformSession> {
        const platformConfig = input.platformConfig;

        if (!platformConfig) {
            throw new WorkflowError('Platform configuration is required for platform session creation');
        }

        this.logger.info(`[PlatformSessionFactory] Creating session for platform: ${platformConfig.platform}`);

        const driver = await this.driverFactory.createDriver({
            platformConfig,
            ...(input.options && { options: input.options })
        });

        let browser: IBrowserAutomation;

        try {
            browser = driver.getBrowserAutomation();
        } catch (error) {
            await driver.disconnect().catch(() => undefined);
            const message = error instanceof Error ? error.message : String(error);
            throw new WorkflowError(`Driver is connected but browser automation bridge is unavailable: ${message}`);
        }

        const executionUrl = this.getExecutionUrlFromInput(input);
        const shouldNavigate = platformConfig.platform === 'web';

        return {
            executionUrl,
            shouldNavigate,
            browser,
            driver,
            dispose: async () => {
                await driver.disconnect().catch(err => {
                    this.logger.warn(`[PlatformSessionFactory] Error disconnecting driver: ${String(err)}`);
                });
            }
        };
    }

    private async createLegacyWebSession(input: RunTestInput, testRunId: string): Promise<PlatformSession> {
        const url = input.url;
        if (!url) {
            throw new WorkflowError('URL is required when no platform configuration is provided');
        }

        this.logger.warn('[PlatformSessionFactory] Using legacy web session allocation flow');

        const node: INode = await this.gateway.allocateSession(testRunId);
        const browserResult = await node.allocate();
        if (browserResult.isErr()) {
            throw new WorkflowError(`Failed to allocate browser: ${browserResult.error.message}`);
        }

        const browser = browserResult.value;
        await browser.launch({ headless: input.options?.headless ?? true });

        return {
            executionUrl: url,
            shouldNavigate: true,
            browser,
            dispose: async () => {
                await browser.close().catch(() => undefined);
                await this.gateway.releaseSession(testRunId).catch(err => {
                    this.logger.warn(`[PlatformSessionFactory] Error releasing legacy session: ${String(err)}`);
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

        if (input.url) {
            return input.url;
        }

        throw new WorkflowError('Unable to resolve execution URL from provided input');
    }
}
