import { z } from 'zod';
import { Tool, ToolContext } from '../../../domain/tools/Tool';
import { ResultAsync, errAsync } from 'neverthrow';

const AskUserSchema = z.object({
    question: z.string().describe('The question to ask the user')
});

type AskUserParams = z.infer<typeof AskUserSchema>;

export class AskUserTool implements Tool<AskUserParams, string> {
    readonly name = 'ask_user';
    readonly description = 'Ask the user for input, confirmation, or clarification. Use this when you are stuck, need a verification code (2FA), or need a decision. The agent will pause until the user responds.';
    readonly schema = AskUserSchema;

    execute(params: AskUserParams, context: ToolContext): ResultAsync<string, Error> {
        if (!context.controller) {
            return errAsync(new Error('ExecutionController not available in context'));
        }

        context.controller.requestInput(params.question);

        // We need to return a ResultAsync that resolves when the user provides input.
        // ResultAsync.fromPromise is perfect here.
        return ResultAsync.fromPromise(
            context.controller.waitForInput(),
            (e) => new Error(`Failed to get user input: ${String(e)}`)
        );
    }
}
