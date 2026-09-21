import type { DomiaApi } from '@domia/contracts';
import type { Kernel } from '@domia/kernel';
import { DomiaApiImpl } from './api.js';
import { RunRegistry } from './runRegistry.js';
import { Scheduler } from './scheduler.js';

export { DomiaApiImpl } from './api.js';
export { RunRegistry } from './runRegistry.js';
export { Scheduler, computeNext, type ScheduleDraft } from './scheduler.js';

/** R5 — a cron scheduler bound to the kernel (its own registry for unattended runs). */
export function createScheduler(kernel: Kernel): Scheduler {
  return new Scheduler(kernel, new RunRegistry(kernel));
}

/**
 * Bind the facade to a booted kernel. `interactive` is the D12 surface flag:
 * UI/CLI-watch = true (user.ask waits for a human); scheduler/domia-mcp = false
 * (user.ask degrades to suspend+notify).
 */
export function createApi(kernel: Kernel, interactive = true): DomiaApi {
  return new DomiaApiImpl(kernel, interactive);
}
