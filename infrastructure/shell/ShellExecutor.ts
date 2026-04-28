import { exec } from 'child_process';
import { injectable } from 'tsyringe';
import { DEFAULT_SHELL_TIMEOUT_MS, MAX_SHELL_OUTPUT_LENGTH } from '@shared/defaults';

interface ShellStream {
    readonly content: string;
    readonly fullLength: number;
    readonly truncated: boolean;
}

interface ShellResult {
    readonly stdout: ShellStream;
    readonly stderr: ShellStream;
    readonly exitCode: number;
}

function makeStream(text: string, max: number): ShellStream {
    const fullLength = text.length;
    if (fullLength <= max) return { content: text, fullLength, truncated: false };
    return { content: text.slice(0, max), fullLength, truncated: true };
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
                    stdout: makeStream(stdout, MAX_SHELL_OUTPUT_LENGTH),
                    stderr: makeStream(stderr, MAX_SHELL_OUTPUT_LENGTH),
                    exitCode: resolveExitCode(error),
                });
            });
        });
    }
}
