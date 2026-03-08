import { z } from 'zod';
import { ActionType } from '@domain/enums';
import type { ToolSpec } from '../ToolSpec';

export function createTerminalTools(): ToolSpec[] {
    return [
        {
            name: 'pass',
            description: 'Declare the task PASSED. Call ONLY when you have concrete evidence (via extract or observe) that the goal is fully satisfied. Terminates the agent loop. Input: { summary?: string }. Output: { status: "TASK_COMPLETED", summary: string }.',
            actionType: ActionType.PASS,
            parameters: z.object({
                summary: z.string().optional().describe('Brief description of what was verified and how the goal was met.'),
            }),
            execute: (args) => ({
                status: 'TASK_COMPLETED',
                summary: (args['summary'] as string) ?? 'Task completed successfully',
            }),
        },
        {
            name: 'fail',
            description: 'Declare the task FAILED. Call ONLY after exhausting alternatives and retries. Terminates the agent loop. Input: { reason: string }. Output: { status: "TASK_FAILED", reason: string }.',
            actionType: ActionType.FAIL,
            parameters: z.object({
                reason: z.string().describe('Specific explanation of what was attempted and why it could not succeed.'),
            }),
            execute: (args) => ({
                status: 'TASK_FAILED',
                reason: (args['reason'] as string) ?? 'Unknown failure',
            }),
        },
    ];
}
