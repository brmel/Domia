
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

    register(tool: ToolDefinition): void {
        this.tools.set(tool.name, tool);
        
        for (const platform of tool.metadata.platforms) {
            if (!this.platformTools.has(platform)) {
                this.platformTools.set(platform, new Set());
            }
            this.platformTools.get(platform)!.add(tool.name);
        }
    }

    registerMany(tools: ToolDefinition[]): void {
        tools.forEach(tool => this.register(tool));
    }

    getTool(name: string): ToolDefinition | undefined {
        return this.tools.get(name);
    }

    setActivePlatform(platform: PlatformType): void {
        this.currentPlatform = platform;
    }

    getToolsForPlatform(platform: PlatformType): ToolDefinition[] {
        const toolNames = this.platformTools.get(platform) || new Set();
        return Array.from(toolNames)
            .map(name => this.tools.get(name))
            .filter((tool): tool is ToolDefinition => tool !== undefined);
    }

    getAllTools(): ToolDefinition[] {
        if (!this.currentPlatform) {
            return Array.from(this.tools.values());
        }
        return this.getToolsForPlatform(this.currentPlatform);
    }

    executeTool(name: string, params: unknown, context: ToolContext): ResultAsync<ActionResult, Error> {
        const tool = this.tools.get(name);
        if (!tool) {
            return errAsync(new Error(`Tool '${name}' not found in registry.`));
        }

        if (!tool.metadata.platforms.includes(context.platform)) {
            return errAsync(new Error(
                `Tool '${name}' not available on platform '${context.platform}'. ` +
                `Available on: [${tool.metadata.platforms.join(', ')}]`
            ));
        }

        const validation = tool.schema.safeParse(params);
        if (!validation.success) {
            return errAsync(new Error(`Invalid parameters for tool '${name}': ${validation.error.message}`));
        }

        return tool.execute(params, context);
    }

    clear(): void {
        this.tools.clear();
        this.platformTools.clear();
        this.currentPlatform = undefined;
    }
}
