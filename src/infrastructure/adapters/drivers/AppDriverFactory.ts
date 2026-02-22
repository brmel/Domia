import { injectable, inject } from 'tsyringe';
import { IAppDriver } from '../../../domain/ports/IAppDriver';
import type { IAppDriverFactory, AppDriverCreateConfig } from '../../../domain/ports/IAppDriverFactory';
import type { ILogger } from '../../../domain/ports';
import { WebDriver } from './WebDriver';
import { ElectronDriver, ElectronConnectionConfig } from './ElectronDriver';

export type DriverConfig = AppDriverCreateConfig;

@injectable()
export class AppDriverFactory implements IAppDriverFactory {
    constructor(
        @inject('ILogger') private readonly logger: ILogger,
        @inject(WebDriver) private readonly webDriver: WebDriver,
        @inject(ElectronDriver) private readonly electronDriver: ElectronDriver
    ) { }

    async createDriver(config: AppDriverCreateConfig): Promise<IAppDriver> {
        const platform = config.platformConfig.platform;
        this.logger.info(`[AppDriverFactory] Creating driver for platform: ${platform}`);

        let driver: IAppDriver;

        switch (config.platformConfig.platform) {
            case 'web':
                driver = await this.createWebDriver(config);
                break;

            case 'electron':
                driver = await this.createElectronDriver(config);
                break;

            default:
                throw new Error(`[AppDriverFactory] Unsupported platform: ${String(platform)}`);
        }

        this.logger.debug(`[AppDriverFactory] Driver created and connected`);

        return driver;
    }

    private async createWebDriver(config: AppDriverCreateConfig): Promise<IAppDriver> {
        if (config.platformConfig.platform !== 'web') {
            throw new Error('[AppDriverFactory] Invalid platform config for WebDriver');
        }

        const driver = this.webDriver;
        
        const connectResult = await driver.connect({
            headless: config.options?.headless ?? true,
        });

        if (connectResult.isErr()) {
            throw new Error(`[AppDriverFactory] WebDriver connection failed: ${connectResult.error.message}`);
        }

        this.logger.info(`[AppDriverFactory] WebDriver connected to: ${config.platformConfig.url}`);
        return driver;
    }

    private async createElectronDriver(config: AppDriverCreateConfig): Promise<IAppDriver> {
        if (config.platformConfig.platform !== 'electron') {
            throw new Error('[AppDriverFactory] Invalid platform config for ElectronDriver');
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
                throw new Error(`[AppDriverFactory] ElectronDriver CDP connection failed: ${connectResult.error.message}`);
            }

            this.logger.info(`[AppDriverFactory] ElectronDriver connected via CDP: ${connection.cdpUrl}`);
        } else {
            const launchConfig: ElectronConnectionConfig = {
                executablePath: connection.executablePath,
                ...(connection.launchArgs !== undefined ? { launchArgs: connection.launchArgs } : {}),
                ...(connection.windowTitle !== undefined ? { windowTitle: connection.windowTitle } : {}),
            };
            
            const launchResult = await driver.connect(launchConfig);

            if (launchResult.isErr()) {
                throw new Error(`[AppDriverFactory] ElectronDriver launch failed: ${launchResult.error.message}`);
            }

            this.logger.info(`[AppDriverFactory] ElectronDriver launched from: ${connection.executablePath}`);
        }

        return driver;
    }

}
