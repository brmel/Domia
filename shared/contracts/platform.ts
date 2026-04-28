import { z } from 'zod';

export const MOBILE_DEVICE_PRESETS = ['iPhone 13', 'iPhone 14 Pro', 'Pixel 7', 'Galaxy S23'] as const;
export type MobileDevicePreset = typeof MOBILE_DEVICE_PRESETS[number];

export const WebConfigSchema = z.object({
    platform: z.literal('web'),
    url: z.string().trim().min(1, 'URL is required'),
    device: z.enum(MOBILE_DEVICE_PRESETS).optional(),
});

export function normalizeWebUrl(url: string): string {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return `https://${url}`;
    }
    return url;
}

const ElectronCDPConnectionSchema = z.object({
    type: z.literal('cdp'),
    cdpUrl: z.string()
        .url('Must be a valid URL (e.g., http://localhost:9222)')
        .refine(url => url.startsWith('http://') || url.startsWith('https://'), {
            message: 'CDP URL must use HTTP protocol',
        }),
    windowTitle: z.string().optional(),
});

const ElectronExecutableConnectionSchema = z.object({
    type: z.literal('executable'),
    executablePath: z.string()
        .min(1, 'Executable path is required')
        .refine(path => /\.(exe|app)$/i.test(path) || !path.includes('.'), {
            message: 'Must be a valid executable (.exe, .app, or no extension)',
        }),
    launchArgs: z.array(z.string()).optional(),
    windowTitle: z.string().optional(),
});

export const ElectronConfigSchema = z.object({
    platform: z.literal('electron'),
    connection: z.discriminatedUnion('type', [
        ElectronCDPConnectionSchema,
        ElectronExecutableConnectionSchema,
    ]),
});

const MobileIosCapabilitiesSchema = z.object({
    os: z.literal('ios'),
    bundleId: z.string().min(1),
    deviceName: z.string().min(1),
    platformVersion: z.string().min(1),
    udid: z.string().optional(),
});

const MobileAndroidCapabilitiesSchema = z.object({
    os: z.literal('android'),
    appPackage: z.string().min(1),
    appActivity: z.string().min(1),
    deviceName: z.string().min(1),
    platformVersion: z.string().min(1),
});

export const MobileConfigSchema = z.object({
    platform: z.literal('mobile'),
    appiumServerUrl: z.string().url().default('http://127.0.0.1:4723'),
    capabilities: z.discriminatedUnion('os', [
        MobileIosCapabilitiesSchema,
        MobileAndroidCapabilitiesSchema,
    ]),
});
