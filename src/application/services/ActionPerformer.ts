import { injectable, inject } from 'tsyringe';
import type { IBrowserAutomation, ILogger } from '@domain/ports';
import { ToolRegistry } from '../registries/ToolRegistry';
import { ExecutionController } from '../controllers/ExecutionController';
import { AgentAction } from '@domain/value-objects';
import { Result, ok, err } from 'neverthrow';
import { InteractionError, DomainError } from '@domain/errors';
import { ToolContext } from '@domain/tools/Tool';

@injectable()
export class ActionPerformer {
    constructor(
        @inject('IBrowserAutomation') private readonly browser: IBrowserAutomation,
        @inject('ILogger') private readonly logger: ILogger,
        @inject(ToolRegistry) private readonly toolRegistry: ToolRegistry
    ) { }

    async perform(action: AgentAction, controller: ExecutionController): Promise<Result<void, DomainError>> {
        this.logger.debug('Looking up tool for action', { actionType: action.type });

        // action.type is already AgentActionType here because AgentAction was updated
        const tool = this.toolRegistry.get(action.type);
        if (!tool) {
            return err(new InteractionError(`No tool found for action type: ${action.type}`));
        }

        const toolContext: ToolContext = {
            browser: this.browser,
            logger: this.logger,
            controller
        };

        const result = await tool.execute(action, toolContext);
        if (result.isErr()) {
            this.logger.error('Tool execution failed', result.error);
            const wrappedError = new InteractionError(`Tool execution failed: ${result.error.message}`);
            return err(wrappedError);
        }

        return ok(undefined);
    }
}
