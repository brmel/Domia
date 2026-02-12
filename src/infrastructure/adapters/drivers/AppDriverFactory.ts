import { injectable, inject, container } from 'tsyringe';
import { IAppDriver } from '../../../domain/ports/IAppDriver';
import type { ILogger } from '../../../domain/ports';
import { WebDriver } from './WebDriver';
import { ElectronDriver, ElectronConnectionConfig } from './ElectronDriver';
import { ToolRegistry } from '../../../domain/tools/ToolRegistry';
import type { PlatformConfig } from '../../../domain/types/PlatformConfig';
import { PlatformType } from '../../../domain/tools/ToolMetadata';

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
        @inject(ToolRegistry) private readonly toolRegistry: ToolRegistry
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

        // Register driver's tools with the registry
        this.registerDriverTools(driver);

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

        const driver = container.resolve(WebDriver);
        
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

        const driver = container.resolve(ElectronDriver);
        const connection = config.platformConfig.connection;

        // Handle different connection types
        if (connection.type === 'cdp') {
            const connectConfig: ElectronConnectionConfig = {
                cdpUrl: connection.cdpUrl,
                windowTitle: connection.windowTitle,
            };
            
            const connectResult = await driver.connect(connectConfig);

            if (connectResult.isErr()) {
                throw new Error(`[AppDriverFactory] ElectronDriver CDP connection failed: ${connectResult.error.message}`);
            }

            this.logger.info(`[AppDriverFactory] ElectronDriver connected via CDP: ${connection.cdpUrl}`);
        } else {
            const launchConfig: ElectronConnectionConfig = {
                executablePath: connection.executablePath,
                launchArgs: connection.launchArgs,
                windowTitle: connection.windowTitle,
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
     * Register all tools provided by a driver with the ToolRegistry
     */
    private registerDriverTools(driver: IAppDriver): void {
        const tools = driver.getTools();
        const platform = driver.getCapabilities().platform as unknown as PlatformType;

        this.logger.debug(`[AppDriverFactory] Registering ${tools.length} tools for platform: ${platform}`);

        this.toolRegistry.clear();
        this.toolRegistry.registerMany(tools);
        this.toolRegistry.setActivePlatform(platform);

        const toolNames = tools.map(t => t.name).join(', ');
        this.logger.info(`[AppDriverFactory] Registered ${tools.length} tools for ${platform}: ${toolNames}`);
        this.logger.debug(`[AppDriverFactory] Active platform set to: ${this.toolRegistry.getActivePlatform()}`);
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
                driver = container.resolve(WebDriver);
                const webResult = await driver.connect(connectionOptions);
                if (webResult.isErr()) {
                    throw new Error(`WebDriver connection failed: ${webResult.error.message}`);
                }
                break;
                
            case 'electron':
                driver = container.resolve(ElectronDriver);
                const electronResult = await driver.connect(connectionOptions);
                if (electronResult.isErr()) {
                    throw new Error(`ElectronDriver connection failed: ${electronResult.error.message}`);
                }
                break;
                
            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }
        
        this.registerDriverTools(driver);
        return driver;
    }
}
