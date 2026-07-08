import { createServer } from 'net';
import type { PlatformConfig } from '@domain/types/PlatformConfig';

export function supportsSubRuns(config: PlatformConfig): boolean {
    if (config.platform === 'web') return true;
    return config.platform === 'electron' && config.connection.type === 'executable';
}

export async function isolatedChildConfig(config: PlatformConfig, startUrl?: string): Promise<PlatformConfig> {
    if (config.platform === 'web') {
        return startUrl ? { ...config, url: startUrl } : config;
    }
    if (config.platform === 'electron' && config.connection.type === 'executable') {
        return {
            ...config,
            connection: { ...config.connection, cdpPort: await freePort() },
            ...(startUrl ? { startUrl } : {}),
        };
    }
    throw new Error(`Sub-runs are not supported on this target (${config.platform}); children cannot get an isolated session.`);
}

function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close(() => {
                if (address && typeof address === 'object') resolve(address.port);
                else reject(new Error('Could not allocate a free port'));
            });
        });
    });
}
