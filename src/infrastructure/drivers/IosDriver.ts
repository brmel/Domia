import { ResultAsync, errAsync } from 'neverthrow';
import { IAppDriver, AppCapabilities } from '@domain/ports/IAppDriver';
import type { IStructuredAutomation } from '@domain/ports';
import { Platform } from '@domain/constants/PlatformConstants';

/**
 * Stub iOS driver — placeholder until XCUITest / Appium integration is implemented.
 */
export class IosDriver implements IAppDriver {
    connect(): ResultAsync<void, Error> {
        return errAsync(new Error('iOS driver is not yet implemented. Install the Appium adapter to enable iOS automation.'));
    }

    async disconnect(): Promise<void> {
        // no-op
    }

    getCapabilities(): AppCapabilities {
        return {
            platform: Platform.IOS,
            supportsDOM: false,
            supportsVision: true,
            supportsMultiWindow: false,
            supportsNativeInteraction: true,
        };
    }

    getAutomation(): IStructuredAutomation {
        throw new Error('iOS automation is not yet implemented.');
    }
}
