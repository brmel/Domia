import { EP, resultOk, resultErr, domiaError, moduleId, brandId } from '@domia/contracts';
import type { CaseId, ModuleResult, RunId, RunOptions, ScheduleId, ScheduleRow, StartOptions } from '@domia/contracts';
import { newId } from '@domia/kernel';
import type { Kernel } from '@domia/kernel';
import { RunRegistry } from './runRegistry.js';

const API = moduleId('api');
const UNIT_MS: Readonly<Record<string, number>> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** Minimal cron: `@every <n>s|m|h|d`, `@hourly`, `@daily`. Unknown → null (schedule idles). */
export function computeNext(cron: string, from: Date): string | null {
  const every = /^@every\s+(\d+)\s*([smhd])$/.exec(cron.trim());
  if (every) return new Date(from.getTime() + Number(every[1]) * UNIT_MS[every[2]!]!).toISOString();
  if (cron.trim() === '@hourly') { const d = new Date(from); d.setUTCMinutes(0, 0, 0); d.setUTCHours(d.getUTCHours() + 1); return d.toISOString(); }
  if (cron.trim() === '@daily') { const d = new Date(from); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString(); }
  return null;
}

export interface ScheduleDraft { readonly caseId: CaseId; readonly cron: string; readonly request: string; readonly options?: RunOptions }

/**
 * R5 — cron ticks start unattended runs (`interactive:false`, so user.ask degrades
 * to suspend+notify per D12). Deterministic by design: `tick(now)` is pure input →
 * effects; `start(intervalMs)` just calls it on a timer. A heartbeat is a standing schedule.
 */
export class Scheduler {
  constructor(private readonly kernel: Kernel, private readonly registry: RunRegistry) {}

  private store() { return this.kernel.resolve(EP.Store); }

  async create(draft: ScheduleDraft): Promise<ModuleResult<ScheduleRow>> {
    const store = this.store();
    if (store.isErr()) return resultErr(store.error);
    const now = new Date();
    const next = computeNext(draft.cron, now);
    if (!next) return resultErr(domiaError(API, 'BAD_CONFIG', `unsupported cron '${draft.cron}' (use @every <n>s|m|h|d, @hourly, @daily)`));
    const row: ScheduleRow = {
      id: brandId<'ScheduleId'>(newId(12)), caseId: draft.caseId, cron: draft.cron, request: draft.request,
      options: draft.options ?? {}, enabled: true, nextAt: next, createdAt: now.toISOString(),
    };
    const ins = await store.value.schedules.insert(row);
    return ins.isErr() ? resultErr(ins.error) : resultOk(row);
  }

  async list(): Promise<ModuleResult<readonly ScheduleRow[]>> {
    const store = this.store();
    return store.isErr() ? resultErr(store.error) : store.value.schedules.listEnabled();
  }
  setEnabled(id: ScheduleId, on: boolean): Promise<ModuleResult<void>> {
    const store = this.store();
    return store.isErr() ? Promise.resolve(resultErr(store.error)) : store.value.schedules.update(id, { enabled: on });
  }
  remove(id: ScheduleId): Promise<ModuleResult<void>> {
    const store = this.store();
    return store.isErr() ? Promise.resolve(resultErr(store.error)) : store.value.schedules.remove(id);
  }

  /** Fire every enabled schedule whose nextAt has passed; return the run ids started. */
  async tick(now: Date = new Date()): Promise<ModuleResult<readonly RunId[]>> {
    const store = this.store();
    if (store.isErr()) return resultErr(store.error);
    const listed = await store.value.schedules.listEnabled();
    if (listed.isErr()) return resultErr(listed.error);

    const iso = now.toISOString();
    const started: RunId[] = [];
    for (const s of listed.value) {
      if (!s.nextAt || s.nextAt > iso) continue;
      const run = await this.registry.start(s.caseId, s.request, s.options as StartOptions, false);
      const next = computeNext(s.cron, now);
      const patch: Partial<ScheduleRow> = { ...(run.isOk() ? { lastRunId: run.value } : {}), ...(next ? { nextAt: next } : { enabled: false }) };
      await store.value.schedules.update(s.id, patch);
      if (run.isOk()) started.push(run.value);
    }
    return resultOk(started);
  }

  /** Run ticks on a timer until the returned stop() is called. */
  start(intervalMs = 30_000): () => void {
    const timer = setInterval(() => { void this.tick(); }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    return () => clearInterval(timer);
  }
}
