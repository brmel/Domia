import { injectable, inject } from 'tsyringe';
import type { IAppDriverProvider, AppDriverCreateConfig } from '@domain/ports/IAppDriverFactory';
import type { IAppDriver } from '@domain/ports/IAppDriver';
import type { ILogger } from '@domain/ports';
import { IosDriver } from './IosDriver';

@injectable()
export class IosDriverProvider implements IAppDriverProvider {
    readonly platform = 'ios' as const;

    constructor(@inject('ILogger') private readonly logger: ILogger) {}

    async createDriver(_config: AppDriverCreateConfig): Promise<IAppDriver> {
        this.logger.info('[IosDriverProvider] Creating iOS driver (stub)');
        const driver = new IosDriver();
        const result = await driver.connect();
        if (result.isErr()) {
            throw new Error(`[IosDriverProvider] ${result.error.message}`);
        }
        return driver;
    }
}
