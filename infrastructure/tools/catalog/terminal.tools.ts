import { z } from 'zod';
import { ActionType } from '@domain/enums';
import type { ToolSpec } from '../ToolSpec';
import { toolError, toolSuccess } from '../toolResult';

export function createTerminalTools(onSuspendRequest?: (reason: string) => void): ToolSpec[] {
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
        {
            name: 'suspend',
            description:
                'Suspend the run for later resumption. Use when a task requires waiting for an external trigger (human approval, long batch job, scheduled event) where staying active would waste compute. ' +
                'Run state and conversation history are persisted; the run can be resumed later with `domia run resume <runId>`. ' +
                'Input: { reason: string — short explanation of why suspension was requested }. Output: { status: "suspended", reason }.',
            actionType: ActionType.SUSPEND,
            parameters: z.object({
                reason: z.string().min(1).describe('Why the run is being suspended (e.g. "awaiting approval from product team").'),
            }),
            execute: (args) => {
                if (!onSuspendRequest) return toolError('suspend tool not wired in this context');
                const reason = args['reason'] as string;
                onSuspendRequest(reason);
                return toolSuccess({ status: 'suspended', reason });
            },
        },
    ];
}
