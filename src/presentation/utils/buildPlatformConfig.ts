import type { PlatformConfig, WebPlatformConfig, ElectronPlatformConfig, AndroidPlatformConfig, IosPlatformConfig } from '@domain/types/PlatformConfig';
import type { PlatformFieldValue, UIPlatformType } from '../config/platformRegistry';

export function buildPlatformConfig(
    platform: UIPlatformType,
    fieldValue: PlatformFieldValue
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
        case 'android': {
            const androidFields = fieldValue as Omit<AndroidPlatformConfig, 'platform'>;
            return {
                platform: 'android',
                appPackage: androidFields.appPackage,
                ...(androidFields.appiumUrl ? { appiumUrl: androidFields.appiumUrl } : {}),
                ...(androidFields.deviceSerial ? { deviceSerial: androidFields.deviceSerial } : {}),
            };
        }
        case 'ios': {
            const iosFields = fieldValue as Omit<IosPlatformConfig, 'platform'>;
            return {
                platform: 'ios',
                bundleId: iosFields.bundleId,
                ...(iosFields.appiumUrl ? { appiumUrl: iosFields.appiumUrl } : {}),
                ...(iosFields.deviceUdid ? { deviceUdid: iosFields.deviceUdid } : {}),
            };
        }
    }
}
