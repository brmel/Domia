import { inject, injectable } from 'tsyringe';
import { ToolRegistry } from '../../../domain/tools/ToolRegistry';
import type { IAppDriver } from '../../../domain/ports/IAppDriver';
import { Platform } from '../../../domain/constants/PlatformConstants';
import type { PlatformType } from '../../../domain/tools/ToolMetadata';
import type { ILogger } from '../../../domain/ports';

@injectable()
export class DriverToolRegistrar {
    constructor(
        @inject(ToolRegistry) private readonly toolRegistry: ToolRegistry,
        @inject('ILogger') private readonly logger: ILogger
    ) {}

    registerDriver(driver: IAppDriver): void {
        const tools = driver.getTools();
        const platform = this.mapCapabilitiesPlatform(driver.getCapabilities().platform);

        this.logger.debug(`[DriverToolRegistrar] Registering ${tools.length} tools for platform: ${platform}`);

        this.toolRegistry.clear();
        this.toolRegistry.registerMany(tools);
        this.toolRegistry.setActivePlatform(platform);

        const toolNames = tools.map(t => t.name).join(', ');
        this.logger.info(`[DriverToolRegistrar] Registered ${tools.length} tools for ${platform}: ${toolNames}`);
    }

    private mapCapabilitiesPlatform(platform: Platform): PlatformType {
        switch (platform) {
            case Platform.WEB:
                return 'web';
            case Platform.ELECTRON:
                return 'electron';
            default:
                throw new Error(`[DriverToolRegistrar] Unsupported platform capabilities: ${platform}`);
        }
    }
}
