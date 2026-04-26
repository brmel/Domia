import type { PlatformConfig, WebPlatformConfig, ElectronPlatformConfig } from '@domain/types/PlatformConfig';
import type { PlatformFieldValue, UIPlatformType } from '@frontend/lib/platformRegistry';

export function buildPlatformConfig(
    platform: UIPlatformType,
    fieldValue: PlatformFieldValue,
): PlatformConfig {
    switch (platform) {
        case 'web': {
            const webFields = fieldValue as Omit<WebPlatformConfig, 'platform'>;
            return { platform: 'web', url: webFields.url };
        }
        case 'electron': {
            const electronFields = fieldValue as Omit<ElectronPlatformConfig, 'platform'>;
            return { platform: 'electron', connection: electronFields.connection };
        }
    }
}
