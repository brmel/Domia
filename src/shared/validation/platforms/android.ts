import { z } from 'zod';

export const AndroidConfigSchema = z.object({
  platform: z.literal('android'),
  appPackage: z.string()
    .trim()
    .min(1, 'App package is required (e.g. com.example.app)'),
  appiumUrl: z.string().url().optional(),
  deviceSerial: z.string().optional(),
});
