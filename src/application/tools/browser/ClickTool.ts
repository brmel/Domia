
import { z } from 'zod';
import { ResultAsync } from 'neverthrow';
import { BrowserTool } from './BrowserTool';
import { IBrowserAutomation } from '../../../domain/ports';
import { ElementIdFactory } from '../../../domain/value-objects';

const ClickSchema = z.object({
    elementId: z.number().describe('The ID of the interactive element to click'),
});

export class ClickTool extends BrowserTool<z.infer<typeof ClickSchema>> {
    readonly name = 'click';
    readonly description = 'Click on an interactive element on the page';
    readonly schema = ClickSchema;

    protected perform(browser: IBrowserAutomation, params: z.infer<typeof ClickSchema>): ResultAsync<void, Error> {
        const elementId = ElementIdFactory.unsafe(params.elementId);
        return browser.click(elementId);
    }
}
