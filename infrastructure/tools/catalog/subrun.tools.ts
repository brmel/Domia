import { z } from 'zod';
import { ActionType } from '@domain/enums';
import type { ISubRunLauncher } from '@domain/ports';
import type { ToolSpec } from '../ToolSpec';
import { toolSuccess, toolError, errorMsg } from '../toolResult';

export function createSubRunTools(subRuns: ISubRunLauncher): ToolSpec[] {
    return ([
        {
            name: 'spawn_subrun',
            description:
                'Start an independent child agent run that works on a goal in its own browser session, in parallel with you. ' +
                'Use to fan out independent subtasks (check several sites, fill several forms) or to isolate a risky exploration. ' +
                'The child starts with no context — put everything it needs in the goal. ' +
                'Input: { goal: string, url?: string (child start URL; defaults to this run\'s target) }. Output: { status: "success", runId } immediately; the child runs in the background.',
            actionType: ActionType.SPAWN_SUBRUN,
            parameters: z.object({
                goal: z.string().min(1).describe('Self-contained goal for the child run, including any data it needs.'),
                url: z.string().optional().describe('Absolute start URL for the child. Defaults to the parent run target.'),
            }),
            execute: async (args) => {
                try {
                    const handle = await subRuns.spawn({
                        goal: args['goal'] as string,
                        ...(args['url'] !== undefined ? { url: args['url'] as string } : {}),
                    });
                    return toolSuccess({ runId: handle.runId, active: subRuns.activeCount() });
                } catch (e) {
                    return toolError(errorMsg(e));
                }
            },
        },
        {
            name: 'await_subruns',
            description:
                'Wait for every child run you spawned to finish and collect their results. ' +
                'Call after spawning children when you need their outcomes to continue. ' +
                'Input: {}. Output: { status: "success", results: Array<{ runId, goal, successful, summary }> }.',
            actionType: ActionType.AWAIT_SUBRUNS,
            isLongRunning: true,
            parameters: z.object({}),
            execute: async () => {
                try {
                    const results = await subRuns.awaitAll();
                    return toolSuccess({ results, count: results.length });
                } catch (e) {
                    return toolError(errorMsg(e));
                }
            },
        },
    ] as ToolSpec[]).map(spec => ({ ...spec, category: 'subruns' as const }));
}
