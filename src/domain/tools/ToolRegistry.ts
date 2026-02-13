
import { singleton } from 'tsyringe';
import { ToolDefinition, ActionResult } from './ToolDefinition';
import { ToolContext } from './Tool';
import { ResultAsync, errAsync } from 'neverthrow';
import { PlatformType } from './ToolMetadata';

@singleton()
export class ToolRegistry {
    private tools: Map<string, ToolDefinition> = new Map();
    private platformTools: Map<PlatformType, Set<string>> = new Map();
    private currentPlatform: PlatformType | undefined = undefined;

    /**
     * Registers a new tool with platform awareness
     */
    register(tool: ToolDefinition): void {
        this.tools.set(tool.name, tool);
        
        // Track which platforms have this tool
        for (const platform of tool.metadata.platforms) {
            if (!this.platformTools.has(platform)) {
                this.platformTools.set(platform, new Set());
            }
            this.platformTools.get(platform)!.add(tool.name);
        }
    }

    /**
     * Registers multiple tools at once
     */
    registerMany(tools: ToolDefinition[]): void {
        tools.forEach(tool => this.register(tool));
    }

    /**
     * Retrieves a tool by name
     */
    getTool(name: string): ToolDefinition | undefined {
        return this.tools.get(name);
    }

    /**
     * Set the active platform (filters tool list)
     */
    setActivePlatform(platform: PlatformType): void {
        this.currentPlatform = platform;
    }

    /**
     * Get currently active platform
     */
    getActivePlatform(): PlatformType | undefined {
        return this.currentPlatform;
    }

    /**
     * Get all tools available for a specific platform
     */
    getToolsForPlatform(platform: PlatformType): ToolDefinition[] {
        const toolNames = this.platformTools.get(platform) || new Set();
        return Array.from(toolNames)
            .map(name => this.tools.get(name))
            .filter((tool): tool is ToolDefinition => tool !== undefined);
    }

    /**
     * Returns all registered tools (filtered by active platform if set)
     */
    getAllTools(): ToolDefinition[] {
        if (!this.currentPlatform) {
            // Return all tools if no platform filter
            return Array.from(this.tools.values());
        }
        return this.getToolsForPlatform(this.currentPlatform);
    }

    /**
     * Executes a tool by name with given parameters and platform context
     */
    executeTool(name: string, params: unknown, context: ToolContext): ResultAsync<ActionResult, Error> {
        const tool = this.tools.get(name);
        if (!tool) {
            return errAsync(new Error(`Tool '${name}' not found in registry.`));
        }

        // Check if tool is available on current platform
        if (!tool.metadata.platforms.includes(context.platform)) {
            return errAsync(new Error(
                `Tool '${name}' not available on platform '${context.platform}'. ` +
                `Available on: [${tool.metadata.platforms.join(', ')}]`
            ));
        }

        // Validate params against schema
        const validation = tool.schema.safeParse(params);
        if (!validation.success) {
            return errAsync(new Error(`Invalid parameters for tool '${name}': ${validation.error.message}`));
        }

        return tool.execute(params, context);
    }

    /**
     * Get tools by category
     */
    getToolsByCategory(category: string): ToolDefinition[] {
        return Array.from(this.tools.values())
            .filter(tool => tool.metadata.category === category);
    }

    /**
     * Check if tool is available on platform
     */
    isToolAvailable(toolName: string, platform: PlatformType): boolean {
        const tool = this.tools.get(toolName);
        if (!tool) return false;
        return tool.metadata.platforms.includes(platform);
    }

    /**
     * Switch platform and update available tools filter
     */
    switchPlatform(newPlatform: PlatformType): void {
        this.currentPlatform = newPlatform;
        // Tools remain registered, but getAllTools() now filters by platform
    }

    /**
     * Clears all registered tools
     */
    clear(): void {
        this.tools.clear();
        this.platformTools.clear();
        this.currentPlatform = undefined;
    }
}
