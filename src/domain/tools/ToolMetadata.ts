export type PlatformType = 'web' | 'electron' | 'mobile' | 'desktop';

export enum ToolScope {
    UNIVERSAL = 'universal',
    PLATFORM_SPECIFIC = 'platform-specific',
    POLYMORPHIC = 'polymorphic'
}

export interface ToolMetadata {
    readonly name: string;
    readonly platforms: readonly PlatformType[];
    readonly scope: ToolScope;
    readonly category?: string;
    readonly terminal?: boolean;
}

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
