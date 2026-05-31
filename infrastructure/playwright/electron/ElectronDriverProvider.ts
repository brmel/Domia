import { injectable, inject } from 'tsyringe';
import type { IAppDriverProvider, AppDriverCreateConfig } from '@domain/ports/automation/IAppDriverFactory';
import type { IAppDriver } from '@domain/ports/automation/IAppDriver';
import type { ILogger } from '@domain/ports';
import type { ElectronConnection } from '@domain/types/PlatformConfig';
import { ElectronDriver } from './ElectronDriver';
import type { ElectronConnectionConfig } from './electronCdpConnect';
import { ElectronWindowSelectionPolicy } from './ElectronWindowSelectionPolicy';

@injectable()
export class ElectronDriverProvider implements IAppDriverProvider {
    private static readonly TAG = '[ElectronDriverProvider]';
    readonly platform = 'electron' as const;

    constructor(
        @inject(ElectronWindowSelectionPolicy) private readonly windowSelectionPolicy: ElectronWindowSelectionPolicy,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    async createDriver(config: AppDriverCreateConfig): Promise<IAppDriver> {
        if (config.platformConfig.platform !== 'electron') {
            throw new Error(`${ElectronDriverProvider.TAG} Invalid platform config`);
        }

        const driver = new ElectronDriver(this.windowSelectionPolicy, this.logger);
        const connection = config.platformConfig.connection;

        const connectionConfig = this.buildConnectionConfig(connection);
        const result = await driver.connect(connectionConfig);
        if (result.isErr()) {
            throw new Error(`${ElectronDriverProvider.TAG} ${connection.type} failed: ${result.error.message}`);
        }

        this.logger.info(`${ElectronDriverProvider.TAG} Connected via ${connection.type}`);
        return driver;
    }

    private buildConnectionConfig(connection: ElectronConnection): ElectronConnectionConfig {
        if (connection.type === 'cdp') {
            return {
                cdpUrl: connection.cdpUrl,
                ...(connection.windowTitle ? { windowTitle: connection.windowTitle } : {}),
            };
        }

        const envPort = process.env['ELECTRON_REMOTE_DEBUGGING_PORT'];
        const cdpPort = connection.cdpPort ?? (envPort ? parseInt(envPort, 10) : undefined);

        return {
            executablePath: connection.executablePath,
            ...(connection.launchArgs ? { launchArgs: connection.launchArgs } : {}),
            ...(cdpPort !== undefined ? { cdpPort } : {}),
            ...(connection.windowTitle ? { windowTitle: connection.windowTitle } : {}),
        };
    }
}
