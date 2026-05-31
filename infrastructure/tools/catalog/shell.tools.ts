import { z } from 'zod';
import { ActionType } from '@domain/enums';
import type { ToolSpec } from '../ToolSpec';
import type { ShellExecutor } from '../../shell/ShellExecutor';
import type { IShellPolicy } from '@domain/ports/automation/IShellPolicy';
import { DEFAULT_SHELL_TIMEOUT_MS } from '@shared/defaults';
import { TOOL_SUCCESS, TOOL_ERROR } from '../toolResult';

export function createShellTools(executor: ShellExecutor, policy?: IShellPolicy): ToolSpec[] {
    return [
        {
            name: 'shell_exec',
            category: 'shell' as const,
            description: `Execute a shell command on the host OS. File ops (cat, echo, cp, mv, rm, mkdir, find, grep, wc, diff), code execution (python3, node, bash, ruby), package management (npm, pip, cargo, brew), version control (git), process & environment (env, ps, kill, which), data manipulation (jq, awk, sed, sort, uniq, cut, curl for APIs), build & CI (make, docker, kubectl). Always check exitCode — 0 means success. Default timeout: ${DEFAULT_SHELL_TIMEOUT_MS / 1000}s. Input: { command: string, cwd?: string, timeoutMs?: number }. Output: { status, stdout: { content, fullLength, truncated }, stderr: { content, fullLength, truncated }, exitCode }. Some destructive commands are blocked by policy.`,
            actionType: ActionType.SHELL_EXEC,
            parameters: z.object({
                command: z.string().describe('Shell command to execute (e.g. "ls -la", "npm install").'),
                cwd: z.string().optional().describe('Working directory for the command. Defaults to the system default.'),
                timeoutMs: z.number().int().min(1).optional().describe(`Max execution time in ms. Default ${DEFAULT_SHELL_TIMEOUT_MS}.`),
            }),
            execute: async (args) => {
                const command = args['command'] as string;
                const cwd = args['cwd'] as string | undefined;

                if (policy) {
                    const decision = policy.evaluate(command, cwd);
                    if (!decision.allowed) {
                        const reason = decision.reason ?? 'Command blocked by shell policy';
                        return {
                            status: TOOL_ERROR,
                            stdout: { content: '', fullLength: 0, truncated: false },
                            stderr: { content: reason, fullLength: reason.length, truncated: false },
                            exitCode: 126,
                        };
                    }
                }

                const result = await executor.execute(
                    command,
                    cwd,
                    args['timeoutMs'] as number | undefined,
                );
                return {
                    status: result.exitCode === 0 ? TOOL_SUCCESS : TOOL_ERROR,
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: result.exitCode,
                };
            },
        },
    ];
}
