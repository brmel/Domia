import { z } from 'zod';
import { ActionType } from '@domain/enums/ActionType';
import type { ToolSpec } from '../ToolSpec';
import type { ShellExecutor } from '../../shell/ShellExecutor';
import { DEFAULT_SHELL_TIMEOUT_MS } from '@shared/defaults';
import { TOOL_SUCCESS, TOOL_ERROR } from '../toolResult';

export function createShellTools(executor: ShellExecutor): ToolSpec[] {
    return [
        {
            name: 'shell_exec',
            category: 'shell' as const,
            description: `Execute a shell command on the host OS. Returns stdout, stderr, and exitCode. Use for file operations, builds, git, package installs, or any CLI task. The command runs in a system shell (/bin/sh or cmd.exe). Default timeout: ${DEFAULT_SHELL_TIMEOUT_MS / 1000}s. Input: { command: string, cwd?: string, timeoutMs?: number }. Output: { status: "success"|"error", stdout: string, stderr: string, exitCode: number }.`,
            actionType: ActionType.SHELL_EXEC,
            parameters: z.object({
                command: z.string().describe('Shell command to execute (e.g. "ls -la", "npm install").'),
                cwd: z.string().optional().describe('Working directory for the command. Defaults to the system default.'),
                timeoutMs: z.number().int().min(1).optional().describe(`Max execution time in ms. Default ${DEFAULT_SHELL_TIMEOUT_MS}.`),
            }),
            execute: async (args) => {
                const result = await executor.execute(
                    args['command'] as string,
                    args['cwd'] as string | undefined,
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
