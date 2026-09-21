import { resultErr, resultOk, domiaError, moduleId } from '@domia/contracts';
import type { DomiaModule, ModuleResult } from '@domia/contracts';

const KERNEL = moduleId('kernel');
const TRACE = 'trace';

/** Order by manifest.requires; force `trace` first (D4). Detect cycles. */
export function topoSort(modules: readonly DomiaModule[]): ModuleResult<readonly DomiaModule[]> {
  const byId = new Map(modules.map((m) => [m.manifest.id as string, m]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const order: DomiaModule[] = [];

  const visit = (id: string): ModuleResult<void> => {
    if (visited.has(id)) return resultOk(undefined);
    if (visiting.has(id)) return resultErr(domiaError(KERNEL, 'BAD_CONFIG', `dependency cycle at module '${id}'`));
    const mod = byId.get(id);
    if (!mod) return resultErr(domiaError(KERNEL, 'BAD_CONFIG', `missing required module '${id}'`));
    visiting.add(id);
    for (const req of mod.manifest.requires) {
      const r = visit(req as string);
      if (r.isErr()) return r;
    }
    visiting.delete(id);
    visited.add(id);
    order.push(mod);
    return resultOk(undefined);
  };

  // trace first if present
  if (byId.has(TRACE)) {
    const r = visit(TRACE);
    if (r.isErr()) return resultErr(r.error);
  }
  for (const m of modules) {
    const r = visit(m.manifest.id as string);
    if (r.isErr()) return resultErr(r.error);
  }
  return resultOk(order);
}
