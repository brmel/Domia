import { ZodSchema } from 'zod';
import { ResultAsync, errAsync } from 'neverthrow';
import { Tool, ToolContext } from '../../../domain/tools/Tool';
import { IBrowserAutomation } from '../../../domain/ports';

/**
 * Abstract base class for tools that require browser automation.
 * Handles the common logic of validating the browser instance in the context.
 */
export abstract class BrowserTool<TParams, TResult = void> implements Tool<TParams, TResult> {
    abstract readonly name: string;
    abstract readonly description: string;
    abstract readonly schema: ZodSchema<TParams>;

    execute(params: TParams, context: ToolContext): ResultAsync<TResult, Error> {
        const browser = context.browser as IBrowserAutomation;
        if (!browser) {
            return errAsync(new Error('Browser capability not available in context'));
        }

        return this.perform(browser, params);
    }

    protected abstract perform(browser: IBrowserAutomation, params: TParams): ResultAsync<TResult, Error>;
}
