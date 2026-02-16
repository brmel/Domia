import { injectable } from 'tsyringe';
import type { RunTestInput } from '@application/dtos';
import type { PlatformSession } from '@application/services/platform/PlatformSession';

@injectable()
export class RunBootstrapCoordinator {
    resolveExecutionUrl(input: RunTestInput, runContext?: { session?: PlatformSession }): string {
        const sessionUrl = runContext?.session?.executionUrl;
        if (sessionUrl) {
            return sessionUrl;
        }

        const platformConfig = input.platformConfig;
        if (platformConfig.platform === 'web') {
            return platformConfig.url;
        }

        if (platformConfig.connection.type === 'cdp') {
            return platformConfig.connection.cdpUrl;
        }

        return 'electron://app';
    }

    resolveLaneKey(input: RunTestInput): string {
        const platformConfig = input.platformConfig;

        if (platformConfig.platform === 'web') {
            return `platform:web:${platformConfig.url}`;
        }

        if (platformConfig.connection.type === 'cdp') {
            return `platform:electron:cdp:${platformConfig.connection.cdpUrl}`;
        }

        return `platform:electron:executable:${platformConfig.connection.executablePath}`;
    }
}
