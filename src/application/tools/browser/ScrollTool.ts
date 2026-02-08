import { injectable } from 'tsyringe';
import { z } from 'zod';
import { AgentActionType } from '@domain/enums/AgentActionType';
import { BrowserTool } from './BrowserTool';
import { IBrowserAutomation } from '../../../domain/ports';
import { ResultAsync } from 'neverthrow';

const ScrollSchema = z.object({
    direction: z.enum(['up', 'down']).describe('Direction to scroll'),
});

@injectable()
export class ScrollTool extends BrowserTool<z.infer<typeof ScrollSchema>> {
    readonly name = AgentActionType.SCROLL;
    readonly description = 'Scroll the page up or down';
    readonly schema = ScrollSchema;

    protected perform(browser: IBrowserAutomation, params: z.infer<typeof ScrollSchema>): ResultAsync<void, Error> {
        return browser.scroll(params.direction);
    }
}
