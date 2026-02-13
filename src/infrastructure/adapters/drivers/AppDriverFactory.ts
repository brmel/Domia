import { injectable, inject } from 'tsyringe';
import { IAppDriver } from '../../../domain/ports/IAppDriver';
import type { ILogger } from '../../../domain/ports';
import { WebDriver } from './WebDriver';
import { ElectronDriver, ElectronConnectionConfig } from './ElectronDriver';
import type { PlatformConfig } from '../../../domain/types/PlatformConfig';
import { PlatformType } from '../../../domain/tools/ToolMetadata';
import { DriverToolRegistrar } from './DriverToolRegistrar';

/**
 * Configuration for driver creation from PlatformConfig
 */
export interface DriverConfig {
    readonly platformConfig: PlatformConfig;
    readonly options?: {
        headless?: boolean;
        maxSteps?: number;
        vision?: boolean;
        debugScreenshots?: boolean;
    };
}

/**
 * AppDriverFactory
 * 
 * Factory for creating and initializing the appropriate IAppDriver implementation
 * based on the target platform. Follows the Factory Pattern for clean separation.
 * 
 * Responsibilities:
 * 1. Select correct driver implementation based on platform
 * 2. Register driver's tools with ToolRegistry
 * 3. Return configured driver instance
 * 
 * Usage:
 * ```typescript
 * const driver = await factory.createDriver({ platform: 'electron', connectionOptions: { cdpUrl: 'http://localhost:9222' } });
 * ```
 */
@injectable()
export class AppDriverFactory {
    constructor(
        @inject('ILogger') private readonly logger: ILogger,
        @inject(DriverToolRegistrar) private readonly toolRegistrar: DriverToolRegistrar,
        @inject(WebDriver) private readonly webDriver: WebDriver,
        @inject(ElectronDriver) private readonly electronDriver: ElectronDriver
    ) { }

    /**
     * Create and initialize a driver for the specified platform
     * 
     * @param config - Driver configuration including platformConfig and execution options
     * @returns Configured and connected IAppDriver instance
     * @throws Error if platform is not supported or connection fails
     */
    async createDriver(config: DriverConfig): Promise<IAppDriver> {
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
                const _exhaustive: never = config.platformConfig;
                throw new Error(`[AppDriverFactory] Unsupported platform: ${(_exhaustive as any).platform}`);
        }

        this.toolRegistrar.registerDriver(driver);

        this.logger.debug(`[AppDriverFactory] Driver created, connected, and tools registered`);

        return driver;
    }

    /**
     * Create and connect a WebDriver instance
     */
    private async createWebDriver(config: DriverConfig): Promise<IAppDriver> {
        if (config.platformConfig.platform !== 'web') {
            throw new Error('[AppDriverFactory] Invalid platform config for WebDriver');
        }

        const driver = this.webDriver;
        
        // Connect with web-specific options
        const connectResult = await driver.connect({
            headless: config.options?.headless ?? true,
        });

        if (connectResult.isErr()) {
            throw new Error(`[AppDriverFactory] WebDriver connection failed: ${connectResult.error.message}`);
        }

        this.logger.info(`[AppDriverFactory] WebDriver connected to: ${config.platformConfig.url}`);
        return driver;
    }

    /**
     * Create and connect an ElectronDriver instance
     */
    private async createElectronDriver(config: DriverConfig): Promise<IAppDriver> {
        if (config.platformConfig.platform !== 'electron') {
            throw new Error('[AppDriverFactory] Invalid platform config for ElectronDriver');
        }

        const driver = this.electronDriver;
        const connection = config.platformConfig.connection;

        // Handle different connection types
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

    /**
     * Get available platforms
     */
    getAvailablePlatforms(): PlatformType[] {
        return ['web', 'electron'];
    }

    /**
     * Create driver from legacy config format (backward compatibility)
     * @deprecated Use createDriver with PlatformConfig instead
     */
    async createDriverLegacy(platform: PlatformType, connectionOptions?: any): Promise<IAppDriver> {
        this.logger.warn('[AppDriverFactory] Using deprecated legacy driver creation');
        
        let driver: IAppDriver;
        
        switch (platform) {
            case 'web':
                driver = this.webDriver;
                const webResult = await driver.connect(connectionOptions);
                if (webResult.isErr()) {
                    throw new Error(`WebDriver connection failed: ${webResult.error.message}`);
                }
                break;
                
            case 'electron':
                driver = this.electronDriver;
                const electronResult = await driver.connect(connectionOptions);
                if (electronResult.isErr()) {
                    throw new Error(`ElectronDriver connection failed: ${electronResult.error.message}`);
                }
                break;
                
            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }
        
        this.toolRegistrar.registerDriver(driver);
        return driver;
    }
}
