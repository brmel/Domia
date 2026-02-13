import { z } from 'zod';

export const ToolSafetyLevelSchema = z.enum(['safe', 'caution', 'restricted']);
export type ToolSafetyLevel = z.infer<typeof ToolSafetyLevelSchema>;

export const ToolSideEffectSchema = z.enum(['none', 'ui', 'filesystem', 'network', 'system']);
export type ToolSideEffect = z.infer<typeof ToolSideEffectSchema>;

export const ToolDescriptorSchema = z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    category: z.string().optional(),
    platforms: z.array(z.string()).default([]),
    terminal: z.boolean().default(false),
    safety: ToolSafetyLevelSchema.default('safe'),
    sideEffects: z.array(ToolSideEffectSchema).default(['none'])
});

export type ToolDescriptor = z.infer<typeof ToolDescriptorSchema>;

export const ToolCallRequestSchema = z.object({
    toolName: z.string().min(1),
    input: z.unknown().default({}),
    stepId: z.string().optional(),
    runId: z.string().optional(),
    metadata: z.record(z.unknown()).optional()
});

export type ToolCallRequest = z.infer<typeof ToolCallRequestSchema>;

export const ToolCallResultSchema = z.object({
    success: z.boolean(),
    toolName: z.string().min(1),
    output: z.unknown().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
    terminal: z.boolean().optional()
});

export type ToolCallResult = z.infer<typeof ToolCallResultSchema>;
