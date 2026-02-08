
import { z } from 'zod';
import { ResultAsync } from 'neverthrow';
import { BrowserTool } from './BrowserTool';
import { IBrowserAutomation } from '../../../domain/ports';
import { ElementIdFactory } from '../../../domain/value-objects';

const ExtractSchema = z.object({
    elementId: z.number().describe('The ID of the interactive element to extract text from'),
});

export class ExtractTool extends BrowserTool<z.infer<typeof ExtractSchema>, string> {
    readonly name = 'extract';
    readonly description = 'Extract text from an element';
    readonly schema = ExtractSchema;

    protected perform(browser: IBrowserAutomation, params: z.infer<typeof ExtractSchema>): ResultAsync<string, Error> {
        const elementId = ElementIdFactory.unsafe(params.elementId);
        return browser.extractText(elementId);
    }
}
