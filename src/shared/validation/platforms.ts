import { z } from 'zod';

export const WebConfigSchema = z.object({
  platform: z.literal('web'),
  url: z.string()
    .trim()
    .min(1, "URL is required")
    .transform(val => {
      if (!val.startsWith('http://') && !val.startsWith('https://')) {
        return `https://${val}`;
      }
      return val;
    }),
});

const ElectronCDPConnectionSchema = z.object({
  type: z.literal('cdp'),
  cdpUrl: z.string()
    .url("Must be a valid URL (e.g., http://localhost:9222)")
    .refine(url => url.startsWith('http://') || url.startsWith('https://'), {
      message: "CDP URL must use HTTP protocol"
    }),
  windowTitle: z.string().optional(),
});

const ElectronExecutableConnectionSchema = z.object({
  type: z.literal('executable'),
  executablePath: z.string()
    .min(1, "Executable path is required")
    .refine(path => {
      return /\.(exe|app)$/i.test(path) || !path.includes('.');
    }, {
      message: "Must be a valid executable (.exe, .app, or no extension)"
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

export const AndroidConfigSchema = z.object({
  platform: z.literal('android'),
  appPackage: z.string()
    .trim()
    .min(1, 'App package is required (e.g. com.example.app)'),
  appiumUrl: z.string().url().optional(),
  deviceSerial: z.string().optional(),
});

export const IosConfigSchema = z.object({
  platform: z.literal('ios'),
  bundleId: z.string()
    .trim()
    .min(1, 'Bundle ID is required (e.g. com.example.App)'),
  appiumUrl: z.string().url().optional(),
  deviceUdid: z.string().optional(),
});
