import { z } from 'zod';
import {
    DEFAULT_LLM_MODEL,
    DEFAULT_LLM_PROVIDER,
    DEFAULT_MAX_ACTIONS,
    DEFAULT_DELAY_BETWEEN_STEPS_MS,
    DEFAULT_MAX_REPLANS_PER_RUN,
    DEFAULT_VIEWPORT_WIDTH,
    DEFAULT_VIEWPORT_HEIGHT,
    DEFAULT_ARTIFACTS_DIR,
    DEFAULT_DATABASE_PATH,
} from '@shared/defaults';

export const DomiaConfigSchema = z.object({
    headless: z.boolean().default(true),
    viewport: z.object({
        width: z.number().default(DEFAULT_VIEWPORT_WIDTH),
        height: z.number().default(DEFAULT_VIEWPORT_HEIGHT),
    }).default({ width: DEFAULT_VIEWPORT_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT }),

    ai: z.object({
        provider: z.literal(DEFAULT_LLM_PROVIDER).default(DEFAULT_LLM_PROVIDER),
        model: z.string().default(DEFAULT_LLM_MODEL),
        apiKey: z.string().optional(),
        visionEnabled: z.boolean().default(false),
        debugScreenshots: z.boolean().default(false),
    }).default({ provider: DEFAULT_LLM_PROVIDER, model: DEFAULT_LLM_MODEL, visionEnabled: false, debugScreenshots: false }),

    paths: z.object({
        artifactsDir: z.string().default(DEFAULT_ARTIFACTS_DIR),
        databasePath: z.string().default(DEFAULT_DATABASE_PATH),
    }).default({ artifactsDir: DEFAULT_ARTIFACTS_DIR, databasePath: DEFAULT_DATABASE_PATH }),

    limits: z.object({
        maxSteps: z.number().default(DEFAULT_MAX_ACTIONS),
        delayBetweenSteps: z.number().default(DEFAULT_DELAY_BETWEEN_STEPS_MS),
        maxReplansPerRun: z.number().int().nonnegative().default(DEFAULT_MAX_REPLANS_PER_RUN),
    }).default({
        maxSteps: DEFAULT_MAX_ACTIONS,
        delayBetweenSteps: DEFAULT_DELAY_BETWEEN_STEPS_MS,
        maxReplansPerRun: DEFAULT_MAX_REPLANS_PER_RUN,
    }),

    promptOverrides: z.object({
        prompts: z.record(z.string()).optional(),
        toolDescriptions: z.record(z.string()).optional(),
    }).optional(),
});

export type DomiaConfig = z.infer<typeof DomiaConfigSchema>;
