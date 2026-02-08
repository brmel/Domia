
import { z } from 'zod';
import { ResultAsync } from 'neverthrow';
import { BrowserTool } from './BrowserTool';
import { IBrowserAutomation } from '../../../domain/ports';

const PressKeySchema = z.object({
    key: z.string().describe('Key to press (e.g. Enter, Escape, ArrowDown)'),
});

export class PressKeyTool extends BrowserTool<z.infer<typeof PressKeySchema>> {
    readonly name = 'pressKey';
    readonly description = 'Press a specific key on the keyboard';
    readonly schema = PressKeySchema;

    protected perform(browser: IBrowserAutomation, params: z.infer<typeof PressKeySchema>): ResultAsync<void, Error> {
        return browser.pressKey(params.key);
    }
}
