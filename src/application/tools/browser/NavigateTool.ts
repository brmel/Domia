
import { z } from 'zod';
import { ResultAsync } from 'neverthrow';
import { BrowserTool } from './BrowserTool';
import { IBrowserAutomation } from '../../../domain/ports';
import { Url } from '../../../domain/value-objects';

const NavigateSchema = z.object({
    url: z.string().url().describe('The URL to navigate to'),
});

export class NavigateTool extends BrowserTool<z.infer<typeof NavigateSchema>> {
    readonly name = 'navigate';
    readonly description = 'Navigate to a new URL';
    readonly schema = NavigateSchema;

    protected perform(browser: IBrowserAutomation, params: z.infer<typeof NavigateSchema>): ResultAsync<void, Error> {
        return browser.navigateTo(params.url as Url);
    }
}
