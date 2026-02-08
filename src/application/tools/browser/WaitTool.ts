
import { z } from 'zod';
import { ResultAsync, errAsync } from 'neverthrow';
import { Tool, ToolContext } from '../../../domain/tools/Tool';
import { IBrowserAutomation } from '../../../domain/ports';

const WaitSchema = z.object({
    durationMs: z.number().describe('Duration to wait in milliseconds'),
});

export class WaitTool implements Tool<z.infer<typeof WaitSchema>, void> {
    readonly name = 'wait';
    readonly description = 'Wait for a specified duration';
    readonly schema = WaitSchema;

    execute(params: z.infer<typeof WaitSchema>, context: ToolContext): ResultAsync<void, Error> {
        const browser = context.browser as IBrowserAutomation;
        if (!browser) {
            return errAsync(new Error('Browser capability not available in context'));
        }
        return browser.wait(params.durationMs);
    }
}
