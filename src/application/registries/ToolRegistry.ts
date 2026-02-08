
import { injectable } from 'tsyringe';
import { Tool } from '../../domain/tools/Tool';
import { AgentActionType } from '../../domain/enums/AgentActionType';

@injectable()
export class ToolRegistry {
    private tools = new Map<AgentActionType, Tool>();

    register(tool: Tool) {
        if (this.tools.has(tool.name)) {
            console.warn(`Tool ${tool.name} already registered. Overwriting.`);
        }
        this.tools.set(tool.name, tool);
    }

    get(name: AgentActionType): Tool | undefined {
        return this.tools.get(name);
    }

    getAll(): Tool[] {
        return Array.from(this.tools.values());
    }
}
