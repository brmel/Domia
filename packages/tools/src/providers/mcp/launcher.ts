import { spawn, type ChildProcess } from 'node:child_process';
import { resultOk, resultErr, domiaError, moduleId } from '@domia/contracts';
import type { ModuleResult } from '@domia/contracts';

const TOOLS = moduleId('tools');
const READY_TIMEOUT_MS = 30_000;
const POLL_MS = 250;

export interface LaunchedApp {
  readonly cdpEndpoint: string;
  dispose(): Promise<void>;
}

async function cdpReady(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForCdp(port: number, deadlineMs: number): Promise<boolean> {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    if (await cdpReady(port)) return true;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return false;
}

/** Attach to an already-running app exposing CDP (nothing to launch or clean up). */
export async function attachToCdp(port: number): Promise<ModuleResult<LaunchedApp>> {
  if (!(await waitForCdp(port, 5_000))) {
    return resultErr(domiaError(TOOLS, 'TARGET_UNREACHABLE', `no CDP endpoint on port ${port} — is the app running with --remote-debugging-port=${port}?`));
  }
  return resultOk({ cdpEndpoint: `http://127.0.0.1:${port}`, async dispose() { /* we did not start it, so we do not stop it */ } });
}

/**
 * Launch an Electron app with remote debugging on, and wait until CDP answers.
 * The harness owns this process: we started it, so we stop it (MIL alloc/free).
 *
 * Learned from V1 (and confirmed here): Electron's binary *rejects*
 * `--remote-debugging-port` on the command line ("bad option"), so the port can
 * only be delivered through the environment. The app must forward it itself:
 *
 *   const port = process.env.ELECTRON_REMOTE_DEBUGGING_PORT;
 *   if (port) app.commandLine.appendSwitch('remote-debugging-port', port);
 *
 * Apps that don't cooperate never become debuggable, and we say so plainly rather
 * than hanging. Use `attach` mode for apps you start yourself.
 */
/** Enough of the child's stderr to explain a failure, not enough to flood a log. */
const STDERR_KEEP = 4000;

export async function launchElectron(appPath: string, extraArgs: readonly string[], port: number): Promise<ModuleResult<LaunchedApp>> {
  let child: ChildProcess;
  try {
    // ELECTRON_RUN_AS_NODE makes the binary run as plain Node (no app, no CDP) and
    // is often set by surrounding tooling — strip it so we always get a real app.
    const env: NodeJS.ProcessEnv = { ...process.env, ELECTRON_REMOTE_DEBUGGING_PORT: String(port) };
    delete env['ELECTRON_RUN_AS_NODE'];
    // stderr is piped, not ignored: when the app dies instead of opening its
    // debugging port, its own message is the only thing that says why, and
    // discarding it is how this failure stayed unexplained on CI.
    child = spawn(appPath, [...extraArgs], { stdio: ['ignore', 'ignore', 'pipe'], detached: false, env });
  } catch (e) {
    return resultErr(domiaError(TOOLS, 'TARGET_UNREACHABLE', `failed to launch '${appPath}'`, { cause: e }));
  }

  // spawn reports a missing/unlaunchable binary asynchronously via 'error' — with
  // no listener that becomes an uncaught exception and takes the process down.
  let spawnError: string | null = null;
  child.on('error', (e) => { spawnError = e.message; });
  let exited: number | null = null;
  child.on('exit', (code) => { exited = code ?? 0; });
  let stderr = '';
  child.stderr?.on('data', (c: Buffer) => { stderr = (stderr + c.toString()).slice(-STDERR_KEEP); });

  // Give a failed spawn a tick to surface before committing to the full wait.
  await new Promise((r) => setTimeout(r, 50));
  const ready = spawnError ? false : await waitForCdp(port, READY_TIMEOUT_MS);
  if (!ready) {
    child.kill('SIGKILL');
    const reason = spawnError ?? (exited !== null ? `the app exited with code ${exited}` : `no CDP on port ${port} after ${READY_TIMEOUT_MS}ms`);
    const said = stderr.trim() ? ` It wrote: ${stderr.trim()}` : '';
    return resultErr(domiaError(TOOLS, 'TARGET_UNREACHABLE',
      `electron app did not become debuggable: ${reason}. The app must forward ELECTRON_REMOTE_DEBUGGING_PORT via app.commandLine.appendSwitch('remote-debugging-port', port).${said}`));
  }

  return resultOk({
    cdpEndpoint: `http://127.0.0.1:${port}`,
    async dispose(): Promise<void> {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        // Give it a moment to close cleanly, then insist.
        await new Promise((r) => setTimeout(r, 500));
        if (child.exitCode === null) child.kill('SIGKILL');
      }
    },
  });
}

/** Pick a free-ish debugging port; Electron/Chromium will bind it exclusively. */
export function defaultCdpPort(): number {
  return 9222 + Math.floor(Math.random() * 500);
}
