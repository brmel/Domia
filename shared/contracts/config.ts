import { z } from 'zod';
import {
    DEFAULT_LLM_MODEL,
    DEFAULT_LLM_PROVIDER,
    DEFAULT_MAX_ACTIONS,
    DEFAULT_VIEWPORT_WIDTH,
    DEFAULT_VIEWPORT_HEIGHT,
    DEFAULT_ARTIFACTS_DIR,
    DEFAULT_DATABASE_PATH,
    DEFAULT_REPORT_OUTPUT_DIR,
} from '@shared/defaults';

export const RuntimeConfigSchema = z.object({
    headless: z.boolean().default(true),
    viewMode: z.enum(['embedded', 'detached']).default('embedded'),
    viewport: z.object({
        width: z.number().default(DEFAULT_VIEWPORT_WIDTH),
        height: z.number().default(DEFAULT_VIEWPORT_HEIGHT),
    }).default({ width: DEFAULT_VIEWPORT_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT }),
    limits: z.object({
        maxSteps: z.number().default(DEFAULT_MAX_ACTIONS),
    }).default({
        maxSteps: DEFAULT_MAX_ACTIONS,
    }),
});

export const AiConfigSchema = z.object({
    provider: z.literal(DEFAULT_LLM_PROVIDER).default(DEFAULT_LLM_PROVIDER),
    model: z.string().default(DEFAULT_LLM_MODEL),
    apiKey: z.string().optional(),
    visionEnabled: z.boolean().default(false),
    debugScreenshots: z.boolean().default(false),
});

export const PathsConfigSchema = z.object({
    artifactsDir: z.string().default(DEFAULT_ARTIFACTS_DIR),
    databasePath: z.string().default(DEFAULT_DATABASE_PATH),
});

export const PluginsConfigSchema = z.object({
    shell: z.object({
        enabled: z.boolean().default(false),
        denyPatterns: z.array(z.string()).optional(),
        allowedCwd: z.array(z.string()).optional(),
    }).default({ enabled: false }),
});

export const ReportingConfigSchema = z.object({
    defaultFormat: z.enum(['none', 'junit', 'html', 'all']).default('none'),
    outputDir: z.string().default(DEFAULT_REPORT_OUTPUT_DIR),
});

export const PromptOverridesSchema = z.object({
    prompts: z.record(z.string()).optional(),
    toolDescriptions: z.record(z.string()).optional(),
}).optional();

export const DomiaConfigSchema = RuntimeConfigSchema.extend({
    ai: AiConfigSchema.default({
        provider: DEFAULT_LLM_PROVIDER,
        model: DEFAULT_LLM_MODEL,
        visionEnabled: false,
        debugScreenshots: false,
    }),
    paths: PathsConfigSchema.default({
        artifactsDir: DEFAULT_ARTIFACTS_DIR,
        databasePath: DEFAULT_DATABASE_PATH,
    }),
    promptOverrides: PromptOverridesSchema,
    plugins: PluginsConfigSchema.default({ shell: { enabled: false } }),
    reporting: ReportingConfigSchema.default({
        defaultFormat: 'none',
        outputDir: DEFAULT_REPORT_OUTPUT_DIR,
    }),
});

export type AiConfig = z.infer<typeof AiConfigSchema>;
export type PathsConfig = z.infer<typeof PathsConfigSchema>;
export type PromptOverrides = z.infer<typeof PromptOverridesSchema>;
export type DomiaConfig = z.infer<typeof DomiaConfigSchema>;

export type AiConfigProvider = () => AiConfig;
export type PathsConfigProvider = () => PathsConfig;
