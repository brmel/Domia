import { describe, it, expect } from 'vitest';
import { supportsSubRuns, isolatedChildConfig } from '@backend/runs/subRunPlatform';
import type { PlatformConfig } from '@domain/types/PlatformConfig';

const web: PlatformConfig = { platform: 'web', url: 'https://example.com' };
const electronExec: PlatformConfig = {
    platform: 'electron',
    connection: { type: 'executable', executablePath: '/apps/thing', cdpPort: 9222 },
};
const electronCdp: PlatformConfig = {
    platform: 'electron',
    connection: { type: 'cdp', cdpUrl: 'http://localhost:9222' },
};

describe('sub-run platform isolation', () => {
    it('supports web and electron-executable, rejects attach-only targets', () => {
        expect(supportsSubRuns(web)).toBe(true);
        expect(supportsSubRuns(electronExec)).toBe(true);
        expect(supportsSubRuns(electronCdp)).toBe(false);
    });

    it('gives each electron-executable child a fresh CDP port', async () => {
        const a = await isolatedChildConfig(electronExec);
        const b = await isolatedChildConfig(electronExec);
        if (a.platform !== 'electron' || a.connection.type !== 'executable') throw new Error('unexpected shape');
        if (b.platform !== 'electron' || b.connection.type !== 'executable') throw new Error('unexpected shape');
        expect(a.connection.cdpPort).not.toBe(9222);
        expect(b.connection.cdpPort).not.toBe(9222);
        expect(a.connection.cdpPort).not.toBe(b.connection.cdpPort);
    });

    it('overrides the web child start URL and rejects cdp targets', async () => {
        const child = await isolatedChildConfig(web, 'https://other.example');
        expect(child).toEqual({ platform: 'web', url: 'https://other.example' });
        await expect(isolatedChildConfig(electronCdp)).rejects.toThrow(/not supported/);
    });
});
