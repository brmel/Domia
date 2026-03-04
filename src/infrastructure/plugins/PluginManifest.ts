import { z } from 'zod';
import type { ActionType } from '@domain/enums/ActionType';
import type { PlatformType } from '@domain/types/PlatformConfig';
import type { ToolSpec } from '../tools/ToolSpec';

const PluginToolSchema = z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    actionType: z.string(),
    parameters: z.any(),
    execute: z.function(),
    platforms: z.array(z.string()).optional(),
});

const PluginManifestSchema = z.object({
    name: z.string().min(1),
    tools: z.array(PluginToolSchema).min(1),
});

export interface PluginManifest {
    readonly name: string;
    readonly tools: ToolSpec[];
}

export function validatePluginManifest(raw: unknown): PluginManifest {
    const parsed = PluginManifestSchema.parse(raw);
    return {
        name: parsed.name,
        tools: parsed.tools.map((t) => {
            const spec: ToolSpec = {
                name: t.name,
                description: t.description,
                actionType: t.actionType as ActionType,
                parameters: t.parameters as z.ZodObject<z.ZodRawShape>,
                execute: t.execute as ToolSpec['execute'],
            };
            if (t.platforms) {
                (spec as { platforms: readonly PlatformType[] }).platforms = t.platforms as PlatformType[];
            }
            return spec;
        }),
    };
}
