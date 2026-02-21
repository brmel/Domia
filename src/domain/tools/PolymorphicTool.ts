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

export interface PlatformImplementation<TParams = unknown> {
    readonly platform: PlatformType;
    execute(params: TParams, context: ToolContext): ResultAsync<ActionResult, Error>;
}

/**
 * One tool definition with multiple platform implementations.
 * Avoids tool duplication while allowing platform-specific behavior.
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
    
    addImplementation(impl: PlatformImplementation<TParams>): this {
        if (!this.metadata.platforms.includes(impl.platform)) {
            throw new Error(
                `Cannot add implementation for platform '${impl.platform}'. ` +
                `Tool '${this.name}' config only declares: [${this.metadata.platforms.join(', ')}]`
            );
        }
        
        this.implementations.set(impl.platform, impl);
        return this;
    }
    
    /** Selects the correct platform implementation based on context. */
    execute(params: TParams, context: ToolContext): ResultAsync<ActionResult, Error> {
        const impl = this.implementations.get(context.platform);
        
        if (!impl) {
            return errAsync(new Error(
                `Tool '${this.name}' not implemented for platform '${context.platform}'. ` +
                `Available implementations: [${Array.from(this.implementations.keys()).join(', ')}]`
            ));
        }
        
        return impl.execute(params, context);
    }
}
