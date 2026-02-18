import { inject, injectable } from 'tsyringe';
import { ok, err, type Result } from 'neverthrow';
import { ToolRegistry } from '@domain/tools/ToolRegistry';
import type { ToolContext } from '@domain/tools/Tool';
import type { ToolDefinition } from '@domain/tools/ToolDefinition';
import type { PlatformType } from '@domain/tools/ToolMetadata';
import {
    ToolCallRequestSchema,
    type ToolCallRequest,
    type ToolCallResult,
    type ToolDescriptor
} from './ToolContracts';
import type { IToolCapabilityRegistry } from './IToolCapabilityRegistry';

@injectable()
export class ToolContractService implements IToolCapabilityRegistry {
    constructor(
        @inject(ToolRegistry) private readonly toolRegistry: ToolRegistry
    ) {}

    getToolDescriptors(platform?: PlatformType): ToolDescriptor[] {
        const tools = platform
            ? this.toolRegistry.getToolsForPlatform(platform)
            : this.toolRegistry.getAllTools();

        return tools.map(tool => this.toDescriptor(tool));
    }

    async invokeTool(request: ToolCallRequest, context: ToolContext): Promise<Result<ToolCallResult, Error>> {
        const parsed = ToolCallRequestSchema.safeParse(request);
        if (!parsed.success) {
            return err(new Error(`Invalid tool call request: ${parsed.error.message}`));
        }

        const { toolName, input } = parsed.data;
        const execution = await this.toolRegistry.executeTool(toolName, input, context);
        if (execution.isErr()) {
            return err(execution.error);
        }

        const result = execution.value;
        return ok({
            success: result.success,
            toolName,
            output: result.data,
            message: result.message,
            error: result.error,
            terminal: result.terminal
        });
    }

    private toDescriptor(tool: ToolDefinition): ToolDescriptor {
        const category = tool.metadata.category;
        return {
            name: tool.name,
            description: tool.description,
            platforms: [...tool.metadata.platforms],
            terminal: tool.metadata.terminal ?? false,
            safety: tool.metadata.terminal ? 'restricted' : 'safe',
            sideEffects: this.inferSideEffects(tool),
            ...(category ? { category } : {})
        };
    }

    private inferSideEffects(tool: ToolDefinition): Array<'none' | 'ui' | 'filesystem' | 'network' | 'system'> {
        const category = tool.metadata.category?.toLowerCase() ?? '';
        const name = tool.name.toLowerCase();

        if (name.includes('navigate') || name.includes('click') || name.includes('type') || name.includes('scroll') || category.includes('interaction')) {
            return ['ui'];
        }

        if (name.includes('file') || category.includes('storage')) {
            return ['filesystem'];
        }

        if (name.includes('network') || category.includes('network')) {
            return ['network'];
        }

        if (name.includes('system') || category.includes('system')) {
            return ['system'];
        }

        return ['none'];
    }
}
