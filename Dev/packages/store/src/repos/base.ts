import { resultOk, resultErr, domiaError, moduleId } from '@domia/contracts';
import type { ModuleResult } from '@domia/contracts';

export const STORE = moduleId('store');

/** Run a synchronous DB op, mapping any throw to an IO DomiaError. */
export function attempt<T>(fn: () => T): Promise<ModuleResult<T>> {
  try {
    return Promise.resolve(resultOk(fn()));
  } catch (e) {
    return Promise.resolve(resultErr(domiaError(STORE, 'IO', e instanceof Error ? e.message : String(e), { cause: e })));
  }
}
