
import { z } from 'zod';
import { ResultAsync, errAsync } from 'neverthrow';
import { Tool, ToolContext } from '../../../domain/tools/Tool';
import { IBrowserAutomation } from '../../../domain/ports';
import { Url } from '../../../domain/value-objects';

const NavigateSchema = z.object({
    url: z.string().url().describe('The URL to navigate to'),
});

export class NavigateTool implements Tool<z.infer<typeof NavigateSchema>, void> {
    readonly name = 'navigate';
    readonly description = 'Navigate to a new URL';
    readonly schema = NavigateSchema;

    execute(params: z.infer<typeof NavigateSchema>, context: ToolContext): ResultAsync<void, Error> {
        const browser = context.browser as IBrowserAutomation;
        if (!browser) {
            return errAsync(new Error('Browser capability not available in context'));
        }
        return browser.navigateTo(params.url as Url);
    }
}
