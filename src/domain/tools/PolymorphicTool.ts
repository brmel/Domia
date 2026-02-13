import { ZodSchema } from 'zod';
import { ResultAsync, errAsync } from 'neverthrow';
import { ToolDefinition, ActionResult } from './ToolDefinition';
import { ToolContext } from './Tool';
import { 
    PlatformType, 
    ToolScope, 
    ToolMetadata, 
    createToolMetadata 
} from './ToolMetadata';

/**
 * Platform-specific implementation of a tool
 */
export interface PlatformImplementation<TParams = unknown> {
    /** Platform this implementation is for */
    readonly platform: PlatformType;
    
    /** Execute the tool on this platform */
    execute(params: TParams, context: ToolContext): ResultAsync<ActionResult, Error>;
}

/**
 * PolymorphicTool - One tool definition with multiple platform implementations
 * 
 * This solves the problem of:
 * 1. Avoiding tool duplication
 * 2. Having platform-specific behavior
 * 3. Presenting a unified interface to the LLM
 */
export class PolymorphicTool<TParams = unknown> implements ToolDefinition<TParams> {
    readonly name: string;
    readonly description: string;
    readonly schema: ZodSchema<TParams>;
    readonly metadata: ToolMetadata;
    
    private implementations = new Map<PlatformType, PlatformImplementation<TParams>>();
    
    constructor(config: {
        name: string;
        description: string;
        schema: ZodSchema<TParams>;
        platforms: PlatformType[];
        category?: string;
        terminal?: boolean;
    }) {
        this.name = config.name;
        this.description = config.description;
        this.schema = config.schema;
        
        const metadataConfig: {
            name: string;
            platforms: PlatformType[];
            scope: ToolScope;
            category?: string;
            terminal?: boolean;
        } = {
            name: config.name,
            platforms: config.platforms,
            scope: ToolScope.POLYMORPHIC
        };

        if (config.category !== undefined) {
            metadataConfig.category = config.category;
        }

        if (config.terminal !== undefined) {
            metadataConfig.terminal = config.terminal;
        }
        
        this.metadata = createToolMetadata(metadataConfig);
    }
    
    /**
     * Register platform-specific implementation
     * 
     * @param impl - Platform implementation containing platform type and execute function
     * @returns this (for method chaining)
     */
    addImplementation(impl: PlatformImplementation<TParams>): this {
        // Validate platform is in metadata
        if (!this.metadata.platforms.includes(impl.platform)) {
            throw new Error(
                `Cannot add implementation for platform '${impl.platform}'. ` +
                `Tool '${this.name}' config only declares: [${this.metadata.platforms.join(', ')}]`
            );
        }
        
        this.implementations.set(impl.platform, impl);
        return this;
    }
    
    /**
     * Execute using platform-appropriate implementation
     * 
     * This method is called by ToolRegistry.executeTool()
     * It automatically selects the correct implementation based on the platform in the context
     */
    execute(params: TParams, context: ToolContext): ResultAsync<ActionResult, Error> {
        const impl = this.implementations.get(context.platform);
        
        if (!impl) {
            return errAsync(new Error(
                `Tool '${this.name}' not implemented for platform '${context.platform}'. ` +
                `Available implementations: [${Array.from(this.implementations.keys()).join(', ')}]`
            ));
        }
        
        // Delegate to platform-specific implementation
        return impl.execute(params, context);
    }
    
    /**
     * Check if this tool has an implementation for the given platform
     */
    isAvailableOn(platform: PlatformType): boolean {
        return this.implementations.has(platform);
    }
    
    /**
     * Get all platforms that have implementations
     */
    getImplementedPlatforms(): PlatformType[] {
        return Array.from(this.implementations.keys());
    }
    
    /**
     * Get the implementation for a specific platform (for debugging/testing)
     */
    getImplementation(platform: PlatformType): PlatformImplementation<TParams> | undefined {
        return this.implementations.get(platform);
    }
}
