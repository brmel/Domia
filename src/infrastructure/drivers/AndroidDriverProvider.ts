import { injectable, inject } from 'tsyringe';
import type { IAppDriverProvider, AppDriverCreateConfig } from '@domain/ports/IAppDriverFactory';
import type { IAppDriver } from '@domain/ports/IAppDriver';
import type { ILogger } from '@domain/ports';
import { AndroidDriver } from './AndroidDriver';

@injectable()
export class AndroidDriverProvider implements IAppDriverProvider {
    readonly platform = 'android' as const;

    constructor(@inject('ILogger') private readonly logger: ILogger) {}

    async createDriver(_config: AppDriverCreateConfig): Promise<IAppDriver> {
        this.logger.info('[AndroidDriverProvider] Creating Android driver (stub)');
        const driver = new AndroidDriver();
        const result = await driver.connect();
        if (result.isErr()) {
            throw new Error(`[AndroidDriverProvider] ${result.error.message}`);
        }
        return driver;
    }
}
