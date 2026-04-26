import { exec } from 'child_process';
import { injectable } from 'tsyringe';
import { DEFAULT_SHELL_TIMEOUT_MS, MAX_SHELL_OUTPUT_LENGTH } from '@shared/defaults';

interface ShellResult {
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number;
}

function truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return text.slice(0, max) + `\n...[truncated at ${max} chars]`;
}

function resolveExitCode(error: { code?: string | number } | null): number {
    if (!error || error.code === undefined) return 0;
    return typeof error.code === 'number' ? error.code : 1;
}

@injectable()
export class ShellExecutor {
    execute(command: string, cwd?: string, timeoutMs?: number): Promise<ShellResult> {
        const timeout = timeoutMs ?? DEFAULT_SHELL_TIMEOUT_MS;

        return new Promise<ShellResult>((resolve) => {
            exec(command, { cwd, timeout, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
                resolve({
                    stdout: truncate(stdout, MAX_SHELL_OUTPUT_LENGTH),
                    stderr: truncate(stderr, MAX_SHELL_OUTPUT_LENGTH),
                    exitCode: resolveExitCode(error),
                });
            });
        });
    }
}
