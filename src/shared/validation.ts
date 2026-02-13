import { z } from 'zod';
import { WebConfigSchema } from './validation/platforms/web';
import { ElectronConfigSchema } from './validation/platforms/electron';

export const PlatformConfigSchema = z.discriminatedUnion('platform', [
  WebConfigSchema,
  ElectronConfigSchema,
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
  recoveryMode: z.enum(['observe', 'manual-only', 'auto-safe']).optional(),
  recoveryRunId: z.string().trim().min(1).optional(),
  temporalObservation: z.boolean().optional(),
  temporalBurstFrames: z.number().int().positive().optional(),
  preferredSkillId: z.string().trim().min(1).optional(),
  allowedSkillTrustLevels: z.array(z.enum(['draft', 'verified', 'restricted'])).optional(),
  pluginPreflight: z.object({
    pluginId: z.string().trim().min(1),
    capability: z.enum([
      'ssh.read',
      'ssh.exec',
      'fs.read',
      'fs.write',
      'device.connect',
      'device.read',
      'device.control'
    ])
  }).optional(),
  readinessMode: z.enum(['observe', 'soft-enforce']).optional()
});

export const RunInputSchema = z.object({
  platformConfig: PlatformConfigSchema,
  prompt: z.string().trim().min(1, 'Prompt cannot be empty'),
  options: RunOptionsSchema.optional()
});
export type PlatformConfig = z.infer<typeof PlatformConfigSchema>;
export type RunOptions = z.infer<typeof RunOptionsSchema>;

export { WebConfigSchema } from './validation/platforms/web';
export { ElectronConfigSchema } from './validation/platforms/electron';