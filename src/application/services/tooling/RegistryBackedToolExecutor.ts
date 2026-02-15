import { inject, injectable } from 'tsyringe';
import { err, ok, type Result } from 'neverthrow';
import type { AgentAction } from '@domain/value-objects';
import type { ILogger } from '@domain/ports';
import type { ToolExecutionContext, ToolExecutor } from './ToolExecutor';
import { ToolContractService } from './ToolContractService';
import { ActionToolMapper } from '@shared/tooling/ActionToolMapper';
import type { ToolPolicyService } from './ToolPolicyService';

@injectable()
export class RegistryBackedToolExecutor implements ToolExecutor {
    constructor(
        @inject(ToolContractService) private readonly toolContractService: ToolContractService,
        @inject(ActionToolMapper) private readonly actionToolMapper: ActionToolMapper,
        @inject('IToolPolicyService') private readonly toolPolicyService: ToolPolicyService,
        @inject('ILogger') private readonly logger: ILogger
    ) {}

    async execute(action: AgentAction, context: ToolExecutionContext): Promise<Result<void, Error>> {
        const policyResult = this.toolPolicyService.beforeToolCall(action, context);
        if (policyResult.isErr()) {
            return err(policyResult.error);
        }

        const mapped = this.actionToolMapper.mapActionToRegistryToolCall(action, context.toolContext);

        if (mapped && context.toolContext) {
            const invokeResult = await this.toolContractService.invokeTool(mapped, context.toolContext);
            if (invokeResult.isErr()) {
                return err(new Error(`Tool invocation failed for '${mapped.toolName}': ${invokeResult.error.message}`));
            }

            const toolResult = invokeResult.value;
            if (toolResult.success) {
                return ok(undefined);
            }

            return err(new Error(toolResult.error ?? toolResult.message ?? `Tool '${toolResult.toolName}' failed`));
        }

        this.logger.warn('[RegistryBackedToolExecutor] No registry tool mapping available for action.', {
            actionType: action.type,
            hasToolContext: Boolean(context.toolContext)
        });
        return err(new Error(`No registry tool mapping available for action '${action.type}'.`));
    }
}
