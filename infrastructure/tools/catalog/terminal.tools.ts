import { z } from 'zod';
import { ActionType } from '@domain/enums';
import type { ToolSpec } from '../ToolSpec';
import { toolError, toolSuccess } from '../toolResult';

export function createTerminalTools(onSuspendRequest?: (reason: string) => void): ToolSpec[] {
    return ([
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
            name: 'iterate',
            description:
                'End this pass and start a fresh one with a clean context. Use when the conversation has grown long, when you want to restart with a sharper goal, or when you want a different tool set for the next phase of the task. ' +
                'State everything the next pass needs in nextGoal — it starts with no memory of this conversation. ' +
                'Input: { summary: string, nextGoal?: string, toolCategories?: string[] (from list_categories; omit to keep the current set) }. Output: terminates this pass.',
            actionType: ActionType.ITERATE,
            parameters: z.object({
                summary: z.string().min(1).describe('What this pass accomplished and what remains.'),
                nextGoal: z.string().optional().describe('Complete goal for the next pass, including any findings it must know. Defaults to the original goal plus your summary.'),
                toolCategories: z.array(z.string()).optional().describe('Tool categories to enable next pass. Terminal and meta tools are always included.'),
            }),
            execute: (args) => toolSuccess({ status: 'iterating', summary: args['summary'] as string }),
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
    ] as ToolSpec[]).map(spec => ({ ...spec, category: 'terminal' as const }));
}
