import { injectable } from 'tsyringe';
import { z } from 'zod';
import { AgentActionType } from '@domain/enums/AgentActionType';
import { BrowserTool } from './BrowserTool';
import { IBrowserAutomation } from '../../../domain/ports';
import { UrlFactory } from '../../../domain/value-objects';
import { ResultAsync } from 'neverthrow';

const NavigateSchema = z.object({
    url: z.string().url().describe('The URL to navigate to'),
});

@injectable()
export class NavigateTool extends BrowserTool<z.infer<typeof NavigateSchema>> {
    readonly name = AgentActionType.NAVIGATE;
    readonly description = 'Navigate to a specific URL';
    readonly schema = NavigateSchema;

    protected perform(browser: IBrowserAutomation, params: z.infer<typeof NavigateSchema>): ResultAsync<void, Error> {
        // Zod has already validated that it is a URL string
        return browser.navigateTo(UrlFactory.unsafe(params.url));
    }
}
