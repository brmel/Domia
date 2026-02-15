import { z } from 'zod';

export const DomiaConfigSchema = z.object({
    headless: z.boolean().default(true),
    viewport: z.object({
        width: z.number().default(1280),
        height: z.number().default(800),
    }).default({ width: 1280, height: 800 }),

    ai: z.object({
        provider: z.enum(['google', 'openai', 'anthropic', 'vllm']).default('google'),
        model: z.string().default('gemini-2.0-flash'),
        apiKey: z.string().optional(),
        baseUrl: z.string().url().optional(),
        visionEnabled: z.boolean().default(false),
        debugScreenshots: z.boolean().default(false),
    }).default({ provider: 'google', model: 'gemini-2.0-flash', visionEnabled: false, debugScreenshots: false }),

    selectorEngine: z.object({
        strategyOrder: z.array(z.enum(['fast', 'semantic', 'visual', 'heuristic']))
            .default(['fast', 'semantic', 'visual', 'heuristic']),
    }).default({ strategyOrder: ['fast', 'semantic', 'visual', 'heuristic'] }),

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
