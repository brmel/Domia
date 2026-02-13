import { inject, injectable } from 'tsyringe';
import { err, ok, type Result } from 'neverthrow';
import type { AgentAction } from '@domain/value-objects';
import type { ILogger } from '@domain/ports';
import type { ToolExecutionContext, ToolExecutor } from './ToolExecutor';
import { ToolContractService } from './ToolContractService';
import { BrowserActionToolExecutor } from './BrowserActionToolExecutor';
import { ActionToolMapper } from '@shared/tooling/ActionToolMapper';

@injectable()
export class RegistryBackedToolExecutor implements ToolExecutor {
    constructor(
        @inject(ToolContractService) private readonly toolContractService: ToolContractService,
        @inject(BrowserActionToolExecutor) private readonly browserFallback: BrowserActionToolExecutor,
        @inject(ActionToolMapper) private readonly actionToolMapper: ActionToolMapper,
        @inject('ILogger') private readonly logger: ILogger
    ) {}

    async execute(action: AgentAction, context: ToolExecutionContext): Promise<Result<void, Error>> {
        const mapped = this.actionToolMapper.mapActionToRegistryToolCall(action, context.toolContext);

        if (mapped && context.toolContext) {
            const invokeResult = await this.toolContractService.invokeTool(mapped, context.toolContext);
            if (invokeResult.isErr()) {
                this.logger.debug(`[RegistryBackedToolExecutor] Tool invocation failed for ${mapped.toolName}, falling back: ${invokeResult.error.message}`);
                return this.browserFallback.execute(action, context);
            }

            const toolResult = invokeResult.value;
            if (toolResult.success) {
                return ok(undefined);
            }

            return err(new Error(toolResult.error ?? toolResult.message ?? `Tool '${toolResult.toolName}' failed`));
        }

        return this.browserFallback.execute(action, context);
    }
}
