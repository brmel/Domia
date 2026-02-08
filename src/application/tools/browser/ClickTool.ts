
import { z } from 'zod';
import { ResultAsync, errAsync } from 'neverthrow';
import { Tool, ToolContext } from '../../../domain/tools/Tool';
import { IBrowserAutomation } from '../../../domain/ports';
import { ElementIdFactory } from '../../../domain/value-objects';

const ClickSchema = z.object({
    elementId: z.number().describe('The ID of the interactive element to click'),
});

export class ClickTool implements Tool<z.infer<typeof ClickSchema>, void> {
    readonly name = 'click';
    readonly description = 'Click on an interactive element on the page';
    readonly schema = ClickSchema;

    execute(params: z.infer<typeof ClickSchema>, context: ToolContext): ResultAsync<void, Error> {
        const browser = context.browser as IBrowserAutomation;
        if (!browser) {
            return errAsync(new Error('Browser capability not available in context'));
        }

        const elementId = ElementIdFactory.unsafe(params.elementId);
        return browser.click(elementId);
    }
}
