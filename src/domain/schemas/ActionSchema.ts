
import { z } from 'zod';

// Helper for loose number parsing (handles LLM string outputs for numbers)
const LooseNumber = z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]);

// Define the precise schema for agent actions
export const ActionSchema = z.object({
    thought: z.string().optional().describe("Reasoning behind the action"),
    action: z.discriminatedUnion("type", [
        z.object({
            type: z.literal("click"),
            elementId: LooseNumber.describe("ID of element to click"),
        }),
        z.object({
            type: z.literal("type"),
            elementId: LooseNumber.describe("ID of input element"),
            text: z.string(),
            submit: z.boolean().optional(),
        }),
        z.object({
            type: z.literal("pressKey"),
            key: z.string(),
        }),
        z.object({
            type: z.literal("scroll"),
            direction: z.enum(["up", "down"]),
        }),
        z.object({
            type: z.literal("wait"),
            durationMs: LooseNumber.optional().default(1000),
        }),
        z.object({
            type: z.literal("extract"),
            elementId: LooseNumber,
        }),
        z.object({
            type: z.literal("navigate"),
            url: z.string().url(),
        }),
        z.object({
            type: z.literal("pass"),
            summary: z.string().describe("Evidence of success").optional().default("Task completed successfully"),
        }),
        z.object({
            type: z.literal("fail"),
            reason: z.string().describe("Evidence of failure"),
        }),
    ]),
});

export type AgentActionPayload = z.infer<typeof ActionSchema>;
