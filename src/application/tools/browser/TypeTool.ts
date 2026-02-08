
import { injectable } from 'tsyringe';
import { z } from 'zod';
import { ResultAsync, okAsync } from 'neverthrow';
import { BrowserTool } from './BrowserTool';
import { AgentActionType } from '@domain/enums/AgentActionType';
import { IBrowserAutomation } from '../../../domain/ports';
import { ElementIdFactory } from '../../../domain/value-objects';

const TypeSchema = z.object({
    elementId: z.number().describe('The ID of the interactive element to type into'),
    text: z.string().describe('The text to type'),
    submit: z.boolean().optional().describe('Whether to press Enter after typing'),
});

type TypeParams = z.infer<typeof TypeSchema>;

@injectable()
export class TypeTool extends BrowserTool<TypeParams> {
    readonly name = AgentActionType.TYPE;
    readonly description = 'Types text into an element';
    readonly schema = TypeSchema;

    protected perform(browser: IBrowserAutomation, params: z.infer<typeof TypeSchema>): ResultAsync<void, Error> {
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
