import { join } from 'node:path';
import { createKernel, type Kernel } from '@domia/kernel';
import { traceModule } from '@domia/trace';
import { storeModule } from '@domia/store';
import { toolsModule } from '@domia/tools';
import { agentModule, type AgentModuleOptions } from '@domia/agent';
import { caseModule } from '@domia/case';
import { memoryModule } from '@domia/memory';
import { skillsModule } from '@domia/skills';
import { auditModule } from '@domia/audit';
import { planModule } from '@domia/plan';
import { loopModule, startRun } from '@domia/loop';
import { resultOk, resultErr, domiaError, moduleId, EP, type AgentTurn, type ModelRef, type ModuleResult, type Outcome, type RunEvent, type RunId, type RunReport } from '@domia/contracts';
import { defaultHostConfig, type HostConfig } from './config.js';
import { loadEnvKeys } from './env.js';
import { loadUserPlugins } from './plugins.js';

export { defaultHostConfig, type HostConfig } from './config.js';
export { startRun, type StartRunOptions } from '@domia/loop';
export { parseModelRef, parseModelSpec } from '@domia/agent';
export { serveStdio as serveMcpStdio } from '@domia/domia-mcp';
export { loadUserPlugins } from './plugins.js';
export { createApiRouter, type ApiRouter, type InvokePath, type WatchPath } from './ipc.js';
export { createApi, createScheduler, Scheduler } from '@domia/api';
export type { Kernel } from '@domia/kernel';
export type { RunEvent } from '@domia/contracts';

const HOST = moduleId('loop');

const DEFAULT_MODEL: ModelRef = { provider: 'google', model: 'gemini-2.5-flash' };

/** Single-host boot. Trace first (D4); store next (its sink joins the tracer). */
export async function bootHeadless(overrides?: Partial<HostConfig> & { agent?: AgentModuleOptions }): Promise<ModuleResult<{ kernel: Kernel; config: HostConfig }>> {
  const config = defaultHostConfig(overrides);
  loadEnvKeys();
  const kernel = createKernel({ ...(config.logLevel ? { logLevel: config.logLevel } : {}), ...(config.values ? { values: config.values } : {}) });
  // Plugins load through the same kernel and ModuleHost as built-ins (D6).
  const plugins = await loadUserPlugins(config.pluginsDir);
  if (plugins.isErr()) return resultErr(plugins.error);

  const loaded = await kernel.load([
    traceModule({ artifactsDir: config.artifactsDir }),
    storeModule({ dbPath: config.dbPath }),
    toolsModule(),
    agentModule(overrides?.agent ?? {}),
    caseModule({ workroot: join(config.dataDir, 'work') }),
    memoryModule({ root: join(config.dataDir, 'memory') }),
    skillsModule({ root: join(config.promptsDir, 'skills') }),
    planModule(),
    auditModule(),
    loopModule({ promptsDir: config.promptsDir, defaultModel: DEFAULT_MODEL }),
    ...plugins.value,
  ]);
  if (loaded.isErr()) return resultErr(loaded.error);
  return resultOk({ kernel, config });
}

/**
 * Re-run a past run from its persisted exchange tape (the recorded agent turns are
 * the script; tools re-execute for real). Phase 1 reads the tape; phase 2 boots a
 * replay-backed kernel and drives the same case/request through those turns.
 */
export async function replayRun(
  targetRunId: RunId,
  opts?: Partial<HostConfig> & { onEvent?: (e: RunEvent) => void },
): Promise<ModuleResult<{ runId: RunId; outcome: Outcome<RunReport> }>> {
  const { onEvent, ...hostOverrides } = opts ?? {};
  const first = await bootHeadless(hostOverrides);
  if (first.isErr()) return resultErr(first.error);

  const store = first.value.kernel.resolve(EP.Store);
  if (store.isErr()) { await first.value.kernel.shutdown(); return resultErr(store.error); }
  const row = await store.value.runs.get(targetRunId);
  const tape = row.isOk() ? await store.value.exchanges.listByRun(targetRunId) : undefined;
  await first.value.kernel.shutdown();
  if (row.isErr()) return resultErr(row.error);
  if (!row.value) return resultErr(domiaError(HOST, 'NOT_FOUND', `no run '${targetRunId}' to replay`));
  if (!tape || tape.isErr()) return resultErr(tape?.isErr() ? tape.error : domiaError(HOST, 'IO', 'failed to read tape'));

  const turns = tape.value.filter((e) => e.direction === 'agent').map((e) => e.payload as AgentTurn);
  if (!turns.length) return resultErr(domiaError(HOST, 'BAD_CONFIG', `run '${targetRunId}' has no recorded turns`));

  const second = await bootHeadless({ ...hostOverrides, agent: { replay: () => turns } });
  if (second.isErr()) return resultErr(second.error);
  try {
    return await startRun(second.value.kernel, {
      caseId: row.value.caseId,
      request: row.value.request,
      model: { provider: 'replay', model: 'scripted' } as ModelRef,
      maxTurns: turns.length + 5,
      ...(onEvent ? { onEvent } : {}),
    });
  } finally {
    await second.value.kernel.shutdown();
  }
}
