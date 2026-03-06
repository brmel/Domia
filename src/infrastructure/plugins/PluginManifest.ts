import { z } from 'zod';
import type { ActionType } from '@domain/enums/ActionType';
import type { PlatformType } from '@domain/types/PlatformConfig';
import type { ToolSpec } from '../tools/ToolSpec';

// ---------------------------------------------------------------------------
// PluginName — nominal brand prevents confusing arbitrary strings with a
// registered plugin's identity.
// ---------------------------------------------------------------------------
declare const __pluginNameBrand: unique symbol;
/** Nominal type for a validated plugin name. Construct via `asPluginName()`. */
export type PluginName = string & { readonly [__pluginNameBrand]: void };
/** Cast a raw string to `PluginName` — call only after validation. */
export function asPluginName(name: string): PluginName {
    return name as PluginName;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const PluginToolSchema = z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    // Plugins may define their own action-type IDs beyond the built-in enum.
    actionType: z.string().min(1),
    parameters: z.any(),
    execute: z.function(),
    platforms: z.array(z.string()).optional(),
});

const PluginManifestSchema = z.object({
    name: z.string().min(1),
    tools: z.array(PluginToolSchema).min(1),
});

export interface PluginManifest {
    readonly name: PluginName;
    readonly tools: ToolSpec[];
}

export function validatePluginManifest(raw: unknown): PluginManifest {
    const parsed = PluginManifestSchema.parse(raw);
    return {
        name: asPluginName(parsed.name),
        tools: parsed.tools.map((t): ToolSpec => ({
            name: t.name,
            description: t.description,
            actionType: t.actionType as ActionType,
            parameters: t.parameters as z.ZodObject<z.ZodRawShape>,
            execute: t.execute as ToolSpec['execute'],
            ...(t.platforms ? { platforms: t.platforms as PlatformType[] } : {}),
        })),
    };
}
