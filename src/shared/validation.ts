import { z } from 'zod';
import { WebConfigSchema, ElectronConfigSchema, AndroidConfigSchema, IosConfigSchema } from './validation/platforms';
import {
    MIN_RECORDING_DURATION_MS,
    MAX_RECORDING_DURATION_MS,
    MAX_RECORDING_INTERVAL_MS,
} from '@shared/defaults';

export const PlatformConfigSchema = z.discriminatedUnion('platform', [
  WebConfigSchema,
  ElectronConfigSchema,
  AndroidConfigSchema,
  IosConfigSchema,
]);

export const RunOptionsSchema = z.object({
  headless: z.boolean().optional(),
  maxSteps: z.number().int().positive().optional(),
  maxDurationMs: z.number().int().positive().optional(),
  maxEstimatedTokens: z.number().int().positive().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  provider: z.string().optional(),
  verbose: z.boolean().optional(),
  debug: z.boolean().optional(),
  vision: z.boolean().optional(),
  debugScreenshots: z.boolean().optional(),
  readinessMode: z.enum(['observe', 'soft-enforce']).optional(),
  readinessProfile: z.enum(['dev', 'staging', 'production']).optional(),
  recording: z.boolean().optional(),
  recordingMaxDurationMs: z.number().int().min(MIN_RECORDING_DURATION_MS).max(MAX_RECORDING_DURATION_MS).optional(),
  recordingIntervalMs: z.number().int().min(MIN_RECORDING_DURATION_MS).max(MAX_RECORDING_INTERVAL_MS).optional(),
});

export const RunInputSchema = z.object({
  platformConfig: PlatformConfigSchema,
  prompt: z.string().trim().min(1, 'Prompt cannot be empty'),
  options: RunOptionsSchema.optional()
});
export type RunOptions = z.infer<typeof RunOptionsSchema>;
