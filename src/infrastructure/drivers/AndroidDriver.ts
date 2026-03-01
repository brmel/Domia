import { ResultAsync, errAsync } from 'neverthrow';
import { IAppDriver, AppCapabilities } from '@domain/ports/IAppDriver';
import type { IStructuredAutomation } from '@domain/ports';

/**
 * Stub Android driver — placeholder until Appium / UIAutomator integration is implemented.
 */
export class AndroidDriver implements IAppDriver {
    connect(): ResultAsync<void, Error> {
        return errAsync(new Error('Android driver is not yet implemented. Install the Appium adapter to enable Android automation.'));
    }

    async disconnect(): Promise<void> {
        // no-op
    }

    getCapabilities(): AppCapabilities {
        return {
            platform: 'android',
            supportsDOM: false,
            supportsVision: true,
            supportsMultiWindow: false,
            supportsNativeInteraction: true,
        };
    }

    getAutomation(): IStructuredAutomation {
        throw new Error('Android automation is not yet implemented.');
    }
}
