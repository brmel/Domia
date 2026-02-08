import { ZodSchema } from 'zod';
import { ResultAsync, errAsync } from 'neverthrow';
import { Tool, ToolContext } from '../../../domain/tools/Tool';
import { IBrowserAutomation } from '../../../domain/ports';
import { ElementIdFactory } from '../../../domain/value-objects';

/**
 * Abstract base class for tools that require browser automation.
 * Handles the common logic of validating the browser instance in the context.
 */
export abstract class BrowserTool<TParams, TResult = void> implements Tool<TParams, TResult> {
    abstract readonly name: string;
    abstract readonly description: string;
    abstract readonly schema: ZodSchema<TParams>;

    execute(params: TParams, context: ToolContext): ResultAsync<TResult, Error> {
        const browser = context.browser;
        if (!browser) {
            return errAsync(new Error('Browser capability not available in context'));
        }

        // Auto-highlight if the tool operates on an element
        // We cast params to any to check for elementId existence safely
        const p = params as any;

        const highlightTask = (p.elementId !== undefined && typeof p.elementId === 'number')
            ? browser.highlight(ElementIdFactory.unsafe(p.elementId))
            : ResultAsync.fromPromise(Promise.resolve(), e => new Error(String(e))); // No-op

        // We execute highlight, and regardless of its success/failure (though we swallow/log errors ideally),
        // we proceed to perform the action.
        // For now, let's chain it. If highlight fails, we log and proceed? 
        // Or just fail? Let's assume highlight failure is worth noting but maybe not blocking if its just visual.
        // But for strictness let's chain.

        return highlightTask.orElse((e) => {
            // Log error but continue? 
            if (context.logger) {
                context.logger.warn(`Visual feedback failed: ${e.message}`);
            }
            return ResultAsync.fromPromise(Promise.resolve(), e => new Error(String(e)));
        }).andThen(() => this.perform(browser, params));
    }

    protected abstract perform(browser: IBrowserAutomation, params: TParams): ResultAsync<TResult, Error>;
}
