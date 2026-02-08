
import { z } from 'zod';
import { ResultAsync } from 'neverthrow';
import { BrowserTool } from './BrowserTool';
import { IBrowserAutomation } from '../../../domain/ports';

const WaitSchema = z.object({
    durationMs: z.number().describe('Duration to wait in milliseconds'),
});

export class WaitTool extends BrowserTool<z.infer<typeof WaitSchema>> {
    readonly name = 'wait';
    readonly description = 'Wait for a specified duration';
    readonly schema = WaitSchema;

    protected perform(browser: IBrowserAutomation, params: z.infer<typeof WaitSchema>): ResultAsync<void, Error> {
        return browser.wait(params.durationMs);
    }
}
