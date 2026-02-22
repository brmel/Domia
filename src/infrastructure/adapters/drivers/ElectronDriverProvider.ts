import { injectable, inject } from 'tsyringe';
import type { IAppDriverProvider, AppDriverCreateConfig } from '@domain/ports/IAppDriverFactory';
import type { IAppDriver } from '@domain/ports/IAppDriver';
import type { ILogger } from '@domain/ports';
import { ElectronDriver, ElectronConnectionConfig } from './ElectronDriver';

@injectable()
export class ElectronDriverProvider implements IAppDriverProvider {
    readonly platform = 'electron' as const;

    constructor(
        @inject(ElectronDriver) private readonly electronDriver: ElectronDriver,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    async createDriver(config: AppDriverCreateConfig): Promise<IAppDriver> {
        if (config.platformConfig.platform !== 'electron') {
            throw new Error('[ElectronDriverProvider] Invalid platform config');
        }

        const driver = this.electronDriver;
        const connection = config.platformConfig.connection;

        if (connection.type === 'cdp') {
            const connectConfig: ElectronConnectionConfig = {
                cdpUrl: connection.cdpUrl,
                ...(connection.windowTitle !== undefined ? { windowTitle: connection.windowTitle } : {}),
            };
            const connectResult = await driver.connect(connectConfig);
            if (connectResult.isErr()) {
                throw new Error(`[ElectronDriverProvider] CDP connection failed: ${connectResult.error.message}`);
            }
            this.logger.info(`[ElectronDriverProvider] Connected via CDP: ${connection.cdpUrl}`);
        } else {
            const launchConfig: ElectronConnectionConfig = {
                executablePath: connection.executablePath,
                ...(connection.launchArgs !== undefined ? { launchArgs: connection.launchArgs } : {}),
                ...(connection.windowTitle !== undefined ? { windowTitle: connection.windowTitle } : {}),
            };
            const launchResult = await driver.connect(launchConfig);
            if (launchResult.isErr()) {
                throw new Error(`[ElectronDriverProvider] Launch failed: ${launchResult.error.message}`);
            }
            this.logger.info(`[ElectronDriverProvider] Launched from: ${connection.executablePath}`);
        }

        return driver;
    }
}
