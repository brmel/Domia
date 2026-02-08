
import { z } from 'zod';
import { ResultAsync } from 'neverthrow';
import { BrowserTool } from './BrowserTool';
import { IBrowserAutomation } from '../../../domain/ports';

const ScrollSchema = z.object({
    direction: z.enum(['up', 'down']).describe('Direction to scroll'),
});

export class ScrollTool extends BrowserTool<z.infer<typeof ScrollSchema>> {
    readonly name = 'scroll';
    readonly description = 'Scroll the page up or down';
    readonly schema = ScrollSchema;

    protected perform(browser: IBrowserAutomation, params: z.infer<typeof ScrollSchema>): ResultAsync<void, Error> {
        return browser.scroll(params.direction);
    }
}
