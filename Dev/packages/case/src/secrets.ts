import { resultOk, resultErr, domiaError, moduleId } from '@domia/contracts';
import type { CaseAssets, ModuleResult, SecretRef } from '@domia/contracts';

const CASE = moduleId('case');
const PREFIX = 'secret://';

/**
 * Resolves `secret://NAME` refs to values (env-backed for now; a keychain/age
 * backend can replace this behind the same interface). Values live only in memory
 * on the resolved context — never persisted, never traced (RedactionFilter strips
 * anything shaped like a secret ref before records reach a sink).
 */
export class SecretVault {
  private readonly resolved = new Map<string, string>();

  static resolveAssets(assets: CaseAssets): ModuleResult<SecretVault> {
    const vault = new SecretVault();
    const refs: SecretRef[] = [];
    if (assets.authState) refs.push(assets.authState);
    for (const v of Object.values(assets.env ?? {})) if (typeof v === 'string' && v.startsWith(PREFIX)) refs.push(v as SecretRef);
    for (const ref of refs) {
      const r = vault.load(ref);
      if (r.isErr()) return resultErr(r.error);
    }
    return resultOk(vault);
  }

  private load(ref: SecretRef): ModuleResult<void> {
    const name = ref.slice(PREFIX.length);
    const value = process.env[name] ?? process.env[name.toUpperCase()];
    if (value === undefined) return resultErr(domiaError(CASE, 'NOT_FOUND', `secret '${name}' not resolvable from env`));
    this.resolved.set(ref, value);
    return resultOk(undefined);
  }

  get(ref: SecretRef): ModuleResult<string> {
    const v = this.resolved.get(ref);
    return v !== undefined ? resultOk(v) : resultErr(domiaError(CASE, 'NOT_FOUND', `secret ref not resolved`));
  }
}
