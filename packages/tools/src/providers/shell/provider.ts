import { spawn } from 'node:child_process';
import { z } from 'zod';
import { resultOk, resultErr, domiaError, moduleId } from '@domia/contracts';
import type {
  BindingIO, ModuleResult, SessionOptions, TargetSpec, ToolBinding, ToolCall, ToolManifest, ToolOutput, ToolProvider,
} from '@domia/contracts';
import { Sandbox, capText } from '../sandbox.js';

const TOOLS = moduleId('tools');
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 300_000;

const MANIFEST: ToolManifest = {
  name: 'shell.exec',
  description: 'Run a shell command inside the case workdir. Returns stdout+stderr and the exit code. Use for local scripts, git, build tools — not for driving the app UI.',
  parameters: z.object({
    command: z.string().describe('the command line to run'),
    cwd: z.string().optional().describe('directory relative to the workdir'),
    timeoutMs: z.number().optional().describe(`max runtime (default ${DEFAULT_TIMEOUT_MS}, cap ${MAX_TIMEOUT_MS})`),
  }),
  output: z.unknown(),
  capabilities: ['shell'],
  risk: 'dangerous', // gated by the approvals policy when enabled
};

interface ShellResult { readonly exitCode: number | null; readonly stdout: string; readonly stderr: string; readonly timedOut: boolean }

function runCommand(command: string, cwd: string, timeoutMs: number, signal?: AbortSignal): Promise<ShellResult> {
  // Cross-platform: cmd.exe on Windows, /bin/sh elsewhere.
  const [file, args] = process.platform === 'win32' ? ['cmd.exe', ['/d', '/s', '/c', command]] : ['/bin/sh', ['-c', command]];
  return new Promise((resolvePromise) => {
    const child = spawn(file, args, { cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    const onAbort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (d: Buffer) => { if (stdout.length < 1_000_000) stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { if (stderr.length < 1_000_000) stderr += d.toString(); });
    child.on('error', (e) => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); resolvePromise({ exitCode: null, stdout, stderr: `${stderr}\n${e.message}`, timedOut }); });
    child.on('close', (code) => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); resolvePromise({ exitCode: code, stdout, stderr, timedOut }); });
  });
}

/** Host shell, sandboxed to the case workdir. Session-scoped; every target gets it. */
export class ShellProvider implements ToolProvider {
  readonly id = 'shell';
  readonly role = 'auxiliary' as const;
  readonly scope = 'session' as const;

  supports(_target: TargetSpec): boolean { return true; }
  manifests(_target: TargetSpec): readonly ToolManifest[] { return [MANIFEST]; }

  async attach(_target: TargetSpec, _io: BindingIO, opts?: SessionOptions): Promise<ModuleResult<ToolBinding>> {
    if (!opts?.workdir) return resultErr(domiaError(TOOLS, 'BAD_CONFIG', 'shell provider needs a workdir'));
    const sandbox = new Sandbox(opts.workdir);

    return resultOk({
      manifests: () => [MANIFEST],
      async execute(call: ToolCall, signal?: AbortSignal): Promise<ModuleResult<ToolOutput>> {
        const command = String(call.args['command'] ?? '').trim();
        if (!command) return resultErr(domiaError(TOOLS, 'INVALID_ARGS', 'shell.exec needs a command'));
        const cwd = sandbox.contain(call.args['cwd'] as string | undefined);
        if (cwd.isErr()) return resultErr(cwd.error);
        const requested = Number(call.args['timeoutMs'] ?? DEFAULT_TIMEOUT_MS);
        const timeoutMs = Math.min(Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

        const r = await runCommand(command, cwd.value, timeoutMs, signal);
        // A non-zero exit is data the agent should react to, not a transport failure.
        return resultOk({
          value: {
            exitCode: r.exitCode,
            timedOut: r.timedOut,
            stdout: capText(r.stdout),
            stderr: capText(r.stderr),
          },
        });
      },
      async dispose(): Promise<void> { /* nothing retained */ },
    });
  }
}
