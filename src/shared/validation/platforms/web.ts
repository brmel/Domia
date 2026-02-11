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
  prompt: z.string()
    .trim()
    .min(1, "Test instructions are required")
    .max(5000, "Instructions too long"),
});

export type WebConfig = z.infer<typeof WebConfigSchema>;
