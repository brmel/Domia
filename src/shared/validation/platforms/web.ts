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


