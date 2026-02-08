
import { z } from 'zod';
import { ResultAsync, errAsync } from 'neverthrow';
import { Tool, ToolContext } from '../../../domain/tools/Tool';
import { IBrowserAutomation } from '../../../domain/ports';

const PressKeySchema = z.object({
    key: z.string().describe('Key to press (e.g. Enter, Escape, ArrowDown)'),
});

export class PressKeyTool implements Tool<z.infer<typeof PressKeySchema>, void> {
    readonly name = 'pressKey';
    readonly description = 'Press a specific key on the keyboard';
    readonly schema = PressKeySchema;

    execute(params: z.infer<typeof PressKeySchema>, context: ToolContext): ResultAsync<void, Error> {
        const browser = context.browser as IBrowserAutomation;
        if (!browser) {
            return errAsync(new Error('Browser capability not available in context'));
        }
        return browser.pressKey(params.key);
    }
}
