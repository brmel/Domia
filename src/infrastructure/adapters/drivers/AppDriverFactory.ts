import { injectable, inject, container } from 'tsyringe';
import { IAppDriver } from '../../../domain/ports/IAppDriver';
import type { ILogger } from '../../../domain/ports';
import { WebDriver } from './WebDriver';
import { ElectronDriver } from './ElectronDriver';
import { ToolRegistry } from '../../../domain/tools/ToolRegistry';

/**
 * Platform types supported by the driver factory
 */
export type PlatformType = 'web' | 'electron' | 'mobile';

/**
 * Configuration for driver creation
 */
export interface DriverConfig {
    readonly platform: PlatformType;
    readonly connectionOptions?: any;
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
     * @param config - Driver configuration including platform and connection options
     * @returns Configured IAppDriver instance
     * @throws Error if platform is not supported
     */
    async createDriver(config: DriverConfig): Promise<IAppDriver> {
        this.logger.info(`[AppDriverFactory] Creating driver for platform: ${config.platform}`);

        let driver: IAppDriver;

        switch (config.platform) {
            case 'web':
                driver = this.createWebDriver();
                break;

            case 'electron':
                driver = this.createElectronDriver();
                break;

            case 'mobile':
                throw new Error('[AppDriverFactory] Mobile platform not yet implemented');

            default:
                throw new Error(`[AppDriverFactory] Unsupported platform: ${config.platform}`);
        }

        // Register driver's tools with the registry
        this.registerDriverTools(driver);

        this.logger.debug(`[AppDriverFactory] Driver created and tools registered`);

        return driver;
    }

    /**
     * Create a WebDriver instance
     */
    private createWebDriver(): IAppDriver {
        // Resolve from DI container to maintain proper dependency injection
        return container.resolve(WebDriver);
    }

    /**
     * Create an ElectronDriver instance
     */
    private createElectronDriver(): IAppDriver {
        // Resolve from DI container to maintain proper dependency injection
        return container.resolve(ElectronDriver);
    }

    /**
     * Register all tools provided by a driver with the ToolRegistry
     */
    private registerDriverTools(driver: IAppDriver): void {
        const tools = driver.getTools();
        const platform = driver.getCapabilities().platform;

        this.logger.debug(`[AppDriverFactory] Registering ${tools.length} tools for platform: ${platform}`);

        // Clear existing tools to avoid conflicts when switching drivers
        // Note: In production, you might want more sophisticated tool namespacing
        this.toolRegistry.clear();

        // Register all driver tools
        this.toolRegistry.registerMany(tools);

        const toolNames = tools.map(t => t.name).join(', ');
        this.logger.info(`[AppDriverFactory] Registered ${tools.length} tools: ${toolNames}`);
    }

    /**
     * Get available platforms
     */
    getAvailablePlatforms(): PlatformType[] {
        return ['web', 'electron'];
    }
}
