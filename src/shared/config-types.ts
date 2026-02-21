import { z } from 'zod';

export const DomiaConfigSchema = z.object({
    headless: z.boolean().default(true),
    viewport: z.object({
        width: z.number().default(1280),
        height: z.number().default(800),
    }).default({ width: 1280, height: 800 }),

    ai: z.object({
        provider: z.enum(['google']).default('google'),
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
        maxReplansPerRun: z.number().int().nonnegative().default(2),
        temporalWindowRetentionCount: z.number().int().positive().default(30),
        temporalWindowMaxBytesPerRun: z.number().int().positive().default(2_000_000),
    }).default({
        maxSteps: 20,
        delayBetweenSteps: 1000,
        maxReplansPerRun: 2,
        temporalWindowRetentionCount: 30,
        temporalWindowMaxBytesPerRun: 2_000_000
    }),

    verification: z.object({
        enforceSupervisedTerminalPass: z.boolean().default(true),
        terminalPassMinConfidence: z.number().min(0).max(1).default(0.9),
        terminalPassMinEvidenceItems: z.number().int().positive().default(2),
    }).default({
        enforceSupervisedTerminalPass: true,
        terminalPassMinConfidence: 0.9,
        terminalPassMinEvidenceItems: 2
    }),

    rollout: z.object({
        agenticRuntime: z.object({
            enabled: z.boolean().default(true),
            shadowMode: z.boolean().default(false),
            sloGates: z.object({
                enabled: z.boolean().default(false),
                minimumSamples: z.number().int().positive().default(20),
                minimumMultilingualSamples: z.number().int().nonnegative().default(5),
                thresholds: z.object({
                    toolCallValidityRate: z.number().min(0).max(1).default(0.95),
                    maxRetryRate: z.number().min(0).max(1).default(0.35),
                    maxTerminalFailureRate: z.number().min(0).max(1).default(0.15),
                    multilingualVerificationPassRate: z.number().min(0).max(1).default(0.8),
                }).default({
                    toolCallValidityRate: 0.95,
                    maxRetryRate: 0.35,
                    maxTerminalFailureRate: 0.15,
                    multilingualVerificationPassRate: 0.8,
                }),
            }).default({
                enabled: false,
                minimumSamples: 20,
                minimumMultilingualSamples: 5,
                thresholds: {
                    toolCallValidityRate: 0.95,
                    maxRetryRate: 0.35,
                    maxTerminalFailureRate: 0.15,
                    multilingualVerificationPassRate: 0.8,
                },
            }),
        }).default({
            enabled: true,
            shadowMode: false,
            sloGates: {
                enabled: false,
                minimumSamples: 20,
                minimumMultilingualSamples: 5,
                thresholds: {
                    toolCallValidityRate: 0.95,
                    maxRetryRate: 0.35,
                    maxTerminalFailureRate: 0.15,
                    multilingualVerificationPassRate: 0.8,
                },
            },
        }),
    }).default({
        agenticRuntime: {
            enabled: true,
            shadowMode: false,
            sloGates: {
                enabled: false,
                minimumSamples: 20,
                minimumMultilingualSamples: 5,
                thresholds: {
                    toolCallValidityRate: 0.95,
                    maxRetryRate: 0.35,
                    maxTerminalFailureRate: 0.15,
                    multilingualVerificationPassRate: 0.8,
                },
            },
        },
    }),
});

export type DomiaConfig = z.infer<typeof DomiaConfigSchema>;
