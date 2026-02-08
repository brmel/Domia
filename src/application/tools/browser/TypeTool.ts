
import { z } from 'zod';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { Tool, ToolContext } from '../../../domain/tools/Tool';
import { IBrowserAutomation } from '../../../domain/ports';
import { ElementIdFactory } from '../../../domain/value-objects';

const TypeSchema = z.object({
    elementId: z.number().describe('The ID of the interactive element to type into'),
    text: z.string().describe('The text to type'),
    submit: z.boolean().optional().describe('Whether to press Enter after typing'),
});

export class TypeTool implements Tool<z.infer<typeof TypeSchema>, void> {
    readonly name = 'type';
    readonly description = 'Type text into an input element';
    readonly schema = TypeSchema;

    execute(params: z.infer<typeof TypeSchema>, context: ToolContext): ResultAsync<void, Error> {
        const browser = context.browser as IBrowserAutomation;
        if (!browser) {
            return errAsync(new Error('Browser capability not available in context'));
        }

        const elementId = ElementIdFactory.unsafe(params.elementId);

        return browser.type(elementId, params.text)
            .andThen(() => {
                if (params.submit) {
                    return browser.pressKey('Enter');
                }
                return okAsync(undefined);
            });
    }
}
