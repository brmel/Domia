
import { injectable } from 'tsyringe';
import { z } from 'zod';
import { AgentActionType } from '@domain/enums/AgentActionType';
import { BrowserTool } from './BrowserTool';
import { IBrowserAutomation } from '../../../domain/ports';
import { ResultAsync } from 'neverthrow';

const WaitSchema = z.object({
    durationMs: z.number().describe('Duration to wait in milliseconds'),
});

@injectable()
export class WaitTool extends BrowserTool<z.infer<typeof WaitSchema>> {
    readonly name = AgentActionType.WAIT;
    readonly description = 'Wait for a specified duration';
    readonly schema = WaitSchema;

    protected perform(browser: IBrowserAutomation, params: z.infer<typeof WaitSchema>): ResultAsync<void, Error> {
        return browser.wait(params.durationMs);
    }
}
