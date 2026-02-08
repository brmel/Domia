import { z } from 'zod';
import { cosmiconfigSync } from 'cosmiconfig';
import { injectable } from 'tsyringe';

export const DomiaConfigSchema = z.object({
    headless: z.boolean().default(true),
    viewport: z.object({
        width: z.number().default(1280),
        height: z.number().default(800),
    }).default({ width: 1280, height: 800 }),

    ai: z.object({
        provider: z.enum(['google', 'openai', 'anthropic']).default('google'),
        model: z.string().default('gemini-2.0-flash'),
        apiKey: z.string().optional(), // Can still be loaded from env, but handled by this service
    }).default({ provider: 'google', model: 'gemini-2.0-flash' }),

    paths: z.object({
        artifactsDir: z.string().default('./artifacts'),
        databasePath: z.string().default('./domia.db'),
    }).default({ artifactsDir: './artifacts', databasePath: './domia.db' }),

    limits: z.object({
        maxSteps: z.number().default(20),
        delayBetweenSteps: z.number().default(1000),
    }).default({ maxSteps: 20, delayBetweenSteps: 1000 }),
});

export type DomiaConfig = z.infer<typeof DomiaConfigSchema>;

@injectable()
export class ConfigService {
    private config: DomiaConfig;

    constructor() {
        const explorer = cosmiconfigSync('domia');
        const result = explorer.search();

        let loadedConfig = {};
        if (result && result.config) {
            loadedConfig = result.config;
        }

        // 1. Zod defaults -> 2. File config -> 3. Env overrides
        const parsedFile = DomiaConfigSchema.parse(loadedConfig);

        const envApiKey = process.env['GOOGLE_API_KEY'] ?? process.env['GEMINI_API_KEY'] ?? process.env['OPENAI_API_KEY'];
        if (envApiKey) {
            parsedFile.ai.apiKey = envApiKey;
        }

        this.config = parsedFile;
    }

    get(): DomiaConfig {
        return this.config;
    }
}
