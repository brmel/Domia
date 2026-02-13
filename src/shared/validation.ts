import { z } from 'zod';
import { WebConfigSchema } from './validation/platforms/web';
import { ElectronConfigSchema } from './validation/platforms/electron';

export const PlatformConfigSchema = z.discriminatedUnion('platform', [
  WebConfigSchema,
  ElectronConfigSchema,
]);

export const TestOptionsSchema = z.object({
  maxSteps: z.number().int().positive().max(100).default(20),
  headless: z.boolean().default(false),
  vision: z.boolean().default(true),
  debugScreenshots: z.boolean().default(false),
  verbose: z.boolean().default(false),
  debug: z.boolean().default(false),
}).partial();

export const NewTestInputSchema = z.object({
  platformConfig: PlatformConfigSchema,
  options: TestOptionsSchema.optional(),
});

export const TestInputSchema = z.object({
    url: z.string().trim().min(1, "URL cannot be empty").transform(val => {
        if (!val.startsWith('http://') && !val.startsWith('https://')) {
            return `https://${val}`;
        }
        return val;
    }),
    prompt: z.string().trim().min(1, "Prompt cannot be empty"),
    options: z.object({
        headless: z.boolean().optional(),
        maxSteps: z.number().positive(),
        provider: z.string().optional(),
        verbose: z.boolean().optional(),
        debug: z.boolean().optional(),
        vision: z.boolean().optional(),
        debugScreenshots: z.boolean().optional()
    })
});

export type TestInput = z.infer<typeof TestInputSchema>;
export type NewTestInput = z.infer<typeof NewTestInputSchema>;
export type PlatformConfig = z.infer<typeof PlatformConfigSchema>;

export { WebConfigSchema } from './validation/platforms/web';
export { ElectronConfigSchema } from './validation/platforms/electron';