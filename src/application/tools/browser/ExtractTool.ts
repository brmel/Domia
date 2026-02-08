
import { z } from 'zod';
import { ResultAsync, errAsync } from 'neverthrow';
import { Tool, ToolContext } from '../../../domain/tools/Tool';
import { IBrowserAutomation } from '../../../domain/ports';
import { ElementIdFactory } from '../../../domain/value-objects';

const ExtractSchema = z.object({
    elementId: z.number().describe('The ID of the interactive element to extract text from'),
});

export class ExtractTool implements Tool<z.infer<typeof ExtractSchema>, string> {
    readonly name = 'extract';
    readonly description = 'Extract text from an element';
    readonly schema = ExtractSchema;

    execute(params: z.infer<typeof ExtractSchema>, context: ToolContext): ResultAsync<string, Error> {
        const browser = context.browser as IBrowserAutomation;
        if (!browser) {
            return errAsync(new Error('Browser capability not available in context'));
        }

        // This cast is safe because IBrowserAutomation now has extractText with ElementId
        // But we need to make sure IBrowserAutomation is updated first to avoid TS errors if checked incrementally
        // However, generic browser usage here might just work if we cast or if interface is updated.
        // But wait, params.elementId needs be converted to ElementId type?
        // Yes, ElementIdFactory.unsafe(params.elementId)

        const elementId = ElementIdFactory.unsafe(params.elementId);
        return browser.extractText(elementId);
    }
}
