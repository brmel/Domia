import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { MobileDriverProvider } from '@infrastructure/appium/MobileDriverProvider';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import type { MobilePlatformConfig } from '@domain/types/PlatformConfig';

/**
 * Deterministic mobile coverage that needs no Appium server or device: the
 * provider builds a driver and the driver declares its capability contract.
 * Driving a real app (gestures, locators) requires a live Appium + emulator and
 * belongs in a device lane, not the per-PR gate — see infrastructure/appium.
 */
const config: MobilePlatformConfig = {
    platform: 'mobile',
    appiumServerUrl: 'http://localhost:4723',
    capabilities: {
        os: 'android',
        appPackage: 'com.example.app',
        appActivity: '.MainActivity',
        deviceName: 'Pixel_API_34',
        platformVersion: '14',
    },
};

describe('MobileDriverProvider (capability contract)', () => {
    it('registers for the mobile platform', () => {
        const provider = new MobileDriverProvider(new ConsoleLogger());
        expect(provider.platform).toBe('mobile');
    });

    it('builds a driver whose capabilities match the mobile profile (no DOM, vision + native)', async () => {
        const provider = new MobileDriverProvider(new ConsoleLogger());
        const driver = await provider.createDriver({ platformConfig: config });
        const caps = driver.getCapabilities();
        expect(caps.platform).toBe('mobile');
        expect(caps.supportsDOM).toBe(false);
        expect(caps.supportsVision).toBe(true);
        expect(caps.supportsNativeInteraction).toBe(true);
        expect(caps.supportsMultiWindow).toBe(false);
        expect(driver.getSessionExtras()).toBeUndefined();
    });

    it('rejects a non-mobile platform config', async () => {
        const provider = new MobileDriverProvider(new ConsoleLogger());
        await expect(
            provider.createDriver({ platformConfig: { platform: 'web', url: 'https://x' } as never }),
        ).rejects.toThrow(/Invalid platform config/);
    });
});
