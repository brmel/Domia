import { z } from 'zod';
import { WebConfigSchema } from './validation/platforms/web';
import { ElectronConfigSchema } from './validation/platforms/electron';
import { AndroidConfigSchema } from './validation/platforms/android';
import { IosConfigSchema } from './validation/platforms/ios';

export const PlatformConfigSchema = z.discriminatedUnion('platform', [
  WebConfigSchema,
  ElectronConfigSchema,
  AndroidConfigSchema,
  IosConfigSchema,
]);

export const RunOptionsSchema = z.object({
  headless: z.boolean().optional(),
  maxSteps: z.number().int().positive().optional(),
  maxElements: z.number().int().min(10).max(200).optional(),
  maxDurationMs: z.number().int().positive().optional(),
  maxEstimatedTokens: z.number().int().positive().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  provider: z.string().optional(),
  verbose: z.boolean().optional(),
  debug: z.boolean().optional(),
  vision: z.boolean().optional(),
  debugScreenshots: z.boolean().optional(),
  recoveryMode: z.enum(['observe', 'manual-only', 'auto-safe']).optional(),
  recoveryRunId: z.string().trim().min(1).optional(),
  readinessMode: z.enum(['observe', 'soft-enforce']).optional(),
  readinessProfile: z.enum(['dev', 'staging', 'production']).optional()
});

export const RunInputSchema = z.object({
  platformConfig: PlatformConfigSchema,
  prompt: z.string().trim().min(1, 'Prompt cannot be empty'),
  options: RunOptionsSchema.optional()
});
export type RunOptions = z.infer<typeof RunOptionsSchema>;

