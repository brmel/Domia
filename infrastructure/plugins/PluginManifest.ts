import { z } from 'zod';
import type { ActionType } from '@domain/enums';
import type { PlatformType } from '@domain/types/PlatformConfig';
import type { ToolResult } from '@domain/types/ToolTypes';
import type { PluginName } from '@domain/ports/IPlugin';
import {
    PluginCapability,
    ALLOWED_PLUGIN_CAPABILITIES,
} from '@domain/value-objects/PluginCapability';
import type { ToolSpec } from '../tools/ToolSpec';
import { jsonSchemaToZod, type PluginJsonSchema } from './JsonSchemaToZod';

const PluginCapabilityValues = Object.values(PluginCapability) as [PluginCapability, ...PluginCapability[]];

export const PluginMetadataSchema = z.object({
    name: z.string().min(1),
    version: z.string().min(1).default('0.0.0'),
    description: z.string().default(''),
    capabilities: z.array(z.enum(PluginCapabilityValues)).default([]),
});

export type PluginMetadata = z.infer<typeof PluginMetadataSchema>;

export interface WorkerToolDescriptor {
    readonly name: string;
    readonly description: string;
    readonly actionType: string;
    readonly parameters: PluginJsonSchema;
    readonly platforms?: readonly string[];
}

export interface PluginManifest {
    readonly name: PluginName;
    readonly version: string;
    readonly description: string;
    readonly capabilities: readonly PluginCapability[];
    readonly tools: ToolSpec[];
}

export function validatePluginMetadata(raw: unknown): PluginMetadata {
    const parsed = PluginMetadataSchema.parse(raw);
    for (const cap of parsed.capabilities) {
        if (!ALLOWED_PLUGIN_CAPABILITIES.has(cap)) {
            throw new Error(`[PluginManifest] Unknown capability "${cap}" declared by plugin "${parsed.name}"`);
        }
    }
    return parsed;
}

export function buildToolSpecsFromWorker(
    descriptors: readonly WorkerToolDescriptor[],
    executeFn: (toolName: string, args: Record<string, unknown>) => Promise<ToolResult>,
): ToolSpec[] {
    return descriptors.map((d): ToolSpec => ({
        name: d.name,
        description: d.description,
        actionType: d.actionType as ActionType,
        parameters: jsonSchemaToZod(d.parameters) as z.ZodObject<z.ZodRawShape>,
        execute: async (args) => executeFn(d.name, args as Record<string, unknown>),
        ...(d.platforms ? { platforms: d.platforms as PlatformType[] } : {}),
    }));
}
