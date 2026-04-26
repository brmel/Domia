import { z } from 'zod';
import { ActionType } from '@domain/enums';
import type { ToolSpec } from '../ToolSpec';

export function createTerminalTools(): ToolSpec[] {
    return [
        {
            name: 'finish',
            description: 'Declare the task complete. Terminates the agent loop. Provide a brief summary; optionally a verdict ("pass" or "fail") and a structured value.',
            actionType: ActionType.FINISH,
            parameters: z.object({
                summary: z.string().describe('Short description of what was accomplished or why the task ended.'),
                verdict: z.enum(['pass', 'fail']).optional().describe('Optional pass/fail verdict for assertion-style runs.'),
                value: z.any().optional().describe('Optional structured payload (extracted data, answer, etc.).'),
            }),
            execute: (args) => ({
                status: 'finished',
                summary: (args['summary'] as string) ?? '',
                ...(args['verdict'] !== undefined ? { verdict: args['verdict'] as string } : {}),
                ...(args['value'] !== undefined ? { value: args['value'] } : {}),
            }),
        },
    ];
}
