import { z } from 'zod';

/**
 * Supported platform types in the system
 */
export type PlatformType = 'web' | 'electron' | 'mobile' | 'desktop';

/**
 * Tool scope defines the availability pattern
 */
export enum ToolScope {
    /** Available on all platforms with same implementation */
    UNIVERSAL = 'universal',
    
    /** Available only on specific platforms */
    PLATFORM_SPECIFIC = 'platform-specific',
    
    /** Common tool with platform-specific implementations */
    POLYMORPHIC = 'polymorphic'
}

/**
 * Tool metadata provides discoverability and filtering capabilities
 */
export interface ToolMetadata {
    /** Tool name (must match ToolDefinition.name) */
    readonly name: string;
    
    /** Platforms where this tool is available */
    readonly platforms: readonly PlatformType[];
    
    /** Tool scope (universal, platform-specific, polymorphic) */
    readonly scope: ToolScope;
    
    /** Namespace for platform-specific versions (e.g., 'electron', 'web') */
    readonly namespace?: string;
    
    /** Category for grouping (e.g., 'navigation', 'interaction', 'window') */
    readonly category?: string;
    
    /** Whether this is a terminal tool (ends test execution) */
    readonly terminal?: boolean;
    
    /** Optional semantic version */
    readonly version?: string;
    
    /** Tags for additional categorization */
    readonly tags?: readonly string[];
}

/**
 * Schema for validating tool metadata
 */
export const ToolMetadataSchema = z.object({
    name: z.string().min(1),
    platforms: z.array(z.enum(['web', 'electron', 'mobile', 'desktop'])),
    scope: z.nativeEnum(ToolScope),
    namespace: z.string().optional(),
    category: z.string().optional(),
    terminal: z.boolean().optional(),
    version: z.string().optional(),
    tags: z.array(z.string()).optional()
});

/**
 * Type guard to check if metadata is valid
 */
export function isValidToolMetadata(metadata: unknown): metadata is ToolMetadata {
    const result = ToolMetadataSchema.safeParse(metadata);
    return result.success;
}

/**
 * Create tool metadata with defaults
 */
export function createToolMetadata(
    config: {
        name: string;
        platforms: PlatformType[];
        scope?: ToolScope;
        category?: string;
        terminal?: boolean;
    }
): ToolMetadata {
    const base: { name: string; platforms: PlatformType[]; scope: ToolScope; terminal: boolean } = {
        name: config.name,
        platforms: config.platforms,
        scope: config.scope ?? ToolScope.UNIVERSAL,
        terminal: config.terminal ?? false,
    };
    
    if (config.category !== undefined) {
        return { ...base, category: config.category };
    }
    
    return base;
}
