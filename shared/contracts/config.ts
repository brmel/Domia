import { z } from 'zod';
import {
    DEFAULT_LLM_MODEL,
    DEFAULT_LLM_PROVIDER,
    DEFAULT_MAX_ACTIONS,
    DEFAULT_DELAY_BETWEEN_STEPS_MS,
    DEFAULT_VIEWPORT_WIDTH,
    DEFAULT_VIEWPORT_HEIGHT,
    DEFAULT_ARTIFACTS_DIR,
    DEFAULT_DATABASE_PATH,
    DEFAULT_REPORT_OUTPUT_DIR,
} from '@shared/defaults';

export const DomiaConfigSchema = z.object({
    headless: z.boolean().default(true),
    viewMode: z.enum(['embedded', 'detached']).default('embedded'),
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
    }).default({
        maxSteps: DEFAULT_MAX_ACTIONS,
        delayBetweenSteps: DEFAULT_DELAY_BETWEEN_STEPS_MS,
    }),

    promptOverrides: z.object({
        prompts: z.record(z.string()).optional(),
        toolDescriptions: z.record(z.string()).optional(),
    }).optional(),

    plugins: z.object({
        shell: z.object({
            enabled: z.boolean().default(false),
            denyPatterns: z.array(z.string()).optional(),
            allowedCwd: z.array(z.string()).optional(),
        }).default({ enabled: false }),
    }).default({ shell: { enabled: false } }),

    reporting: z.object({
        defaultFormat: z.enum(['none', 'junit', 'html', 'all']).default('none'),
        outputDir: z.string().default(DEFAULT_REPORT_OUTPUT_DIR),
    }).default({ defaultFormat: 'none', outputDir: DEFAULT_REPORT_OUTPUT_DIR }),
});

export type DomiaConfig = z.infer<typeof DomiaConfigSchema>;
