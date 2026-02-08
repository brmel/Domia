import { injectable } from 'tsyringe';
import { z } from 'zod';
import { AgentActionType } from '@domain/enums/AgentActionType';
import { BrowserTool } from './BrowserTool';
import { IBrowserAutomation } from '../../../domain/ports';
import { ElementIdFactory } from '../../../domain/value-objects';
import { ResultAsync } from 'neverthrow';

const ExtractSchema = z.object({
    elementId: z.number().describe('The ID of the element to extract text from'),
});

@injectable()
export class ExtractTool extends BrowserTool<z.infer<typeof ExtractSchema>, string> {
    readonly name = AgentActionType.EXTRACT;
    readonly description = 'Extract text content from an element';
    readonly schema = ExtractSchema;

    protected perform(browser: IBrowserAutomation, params: z.infer<typeof ExtractSchema>): ResultAsync<string, Error> {
        const elementId = ElementIdFactory.unsafe(params.elementId);
        return browser.extractText(elementId);
    }
}
