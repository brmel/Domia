import { resultErr, resultOk, domiaError, moduleId } from '@domia/contracts';
import type { ExtensionPoint, ModuleResult } from '@domia/contracts';

const KERNEL = moduleId('kernel');

/** Keyed by point.id; arity enforced at register time (D3). */
export class ExtensionRegistry {
  private readonly impls = new Map<string, unknown[]>();
  private readonly arity = new Map<string, 'one' | 'many'>();

  register<T>(point: ExtensionPoint<T>, impl: T): ModuleResult<void> {
    const existing = this.impls.get(point.id) ?? [];
    if (point.arity === 'one' && existing.length >= 1) {
      return resultErr(domiaError(KERNEL, 'EXTENSION_CONFLICT', `extension point '${point.id}' is 'one'-arity but registered twice`));
    }
    existing.push(impl);
    this.impls.set(point.id, existing);
    this.arity.set(point.id, point.arity);
    return resultOk(undefined);
  }

  resolve<T>(point: ExtensionPoint<T>): ModuleResult<T> {
    const list = this.impls.get(point.id) ?? [];
    if (list.length === 0) return resultErr(domiaError(KERNEL, 'EXTENSION_MISSING', `no implementation for '${point.id}'`));
    if (list.length > 1) return resultErr(domiaError(KERNEL, 'EXTENSION_CONFLICT', `'${point.id}' has ${list.length} impls; use resolveAll`));
    return resultOk(list[0] as T);
  }

  resolveAll<T>(point: ExtensionPoint<T>): ModuleResult<readonly T[]> {
    return resultOk((this.impls.get(point.id) ?? []) as T[]);
  }
}
