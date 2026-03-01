import { z } from 'zod';

export const IosConfigSchema = z.object({
  platform: z.literal('ios'),
  bundleId: z.string()
    .trim()
    .min(1, 'Bundle ID is required (e.g. com.example.App)'),
  appiumUrl: z.string().url().optional(),
  deviceUdid: z.string().optional(),
});
