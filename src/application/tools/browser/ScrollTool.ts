
import { z } from 'zod';
import { ResultAsync, errAsync } from 'neverthrow';
import { Tool, ToolContext } from '../../../domain/tools/Tool';
import { IBrowserAutomation } from '../../../domain/ports';

const ScrollSchema = z.object({
    direction: z.enum(['up', 'down']).describe('Direction to scroll'),
});

export class ScrollTool implements Tool<z.infer<typeof ScrollSchema>, void> {
    readonly name = 'scroll';
    readonly description = 'Scroll the page up or down';
    readonly schema = ScrollSchema;

    execute(params: z.infer<typeof ScrollSchema>, context: ToolContext): ResultAsync<void, Error> {
        const browser = context.browser as IBrowserAutomation;
        if (!browser) {
            return errAsync(new Error('Browser capability not available in context'));
        }

        return browser.scroll(params.direction);
    }
}
