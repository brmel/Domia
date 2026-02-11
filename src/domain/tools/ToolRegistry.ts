
import { singleton } from 'tsyringe';
import { ToolDefinition, ActionResult } from './ToolDefinition';
import { ToolContext } from './Tool';
import { ResultAsync, errAsync } from 'neverthrow';

@singleton()
export class ToolRegistry {
    private tools: Map<string, ToolDefinition> = new Map();

    /**
     * Registers a new tool. Overwrites if name already exists.
     */
    register(tool: ToolDefinition): void {
        this.tools.set(tool.name, tool);
    }

    /**
     * Registers multiple tools at once.
     */
    registerMany(tools: ToolDefinition[]): void {
        tools.forEach(tool => this.register(tool));
    }

    /**
     * Retrieves a tool by name.
     */
    getTool(name: string): ToolDefinition | undefined {
        return this.tools.get(name);
    }

    /**
     * Returns all registered tools.
     */
    getAllTools(): ToolDefinition[] {
        return Array.from(this.tools.values());
    }

    /**
     * Executes a tool by name with given parameters.
     */
    executeTool(name: string, params: any, context: ToolContext): ResultAsync<ActionResult, Error> {
        const tool = this.tools.get(name);
        if (!tool) {
            return errAsync(new Error(`Tool '${name}' not found in registry.`));
        }

        // Validate params against schema
        const validation = tool.schema.safeParse(params);
        if (!validation.success) {
            return errAsync(new Error(`Invalid parameters for tool '${name}': ${validation.error.message}`));
        }

        return tool.execute(params, context);
    }

    /**
     * Clears all registered tools.
     */
    clear(): void {
        this.tools.clear();
    }
}
