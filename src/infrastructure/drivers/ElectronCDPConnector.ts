import { chromium, Browser } from 'playwright';
import type { ILogger } from '@domain/ports';
import { CDP_CONNECTION_TIMEOUT_MS } from '@shared/defaults';
import { retryAsync } from '@shared/reliability/retry';
import { RETRY_PROFILES, isTransientElectronConnectError } from '@shared/reliability/retryProfiles';
import type { RetryOptions } from '@shared/reliability/retry';

export class ElectronCDPConnector {
    private static readonly TAG = '[ElectronCDPConnector]';

    constructor(private readonly logger: ILogger) {}

    async connect(cdpUrl: string, timeoutMs?: number, retryProfile?: RetryOptions): Promise<Browser> {
        const timeout = timeoutMs ?? CDP_CONNECTION_TIMEOUT_MS;
        const profile = retryProfile ?? RETRY_PROFILES.electronCdpConnect;

        this.logger.info(`${ElectronCDPConnector.TAG} Connecting to CDP: ${cdpUrl}`);

        const browser = await retryAsync(
            async () => chromium.connectOverCDP(cdpUrl, { timeout }),
            {
                ...profile,
                shouldRetry: (error) => isTransientElectronConnectError(error),
                onRetry: (info) => {
                    const message = info.error instanceof Error ? info.error.message : String(info.error);
                    this.logger.debug(
                        `${ElectronCDPConnector.TAG} Retry ${info.attempt}/${info.maxAttempts - 1}: ${message}`,
                    );
                },
            },
        );

        this.logger.debug(`${ElectronCDPConnector.TAG} Connected`);
        return browser;
    }
}
