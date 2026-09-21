import { rm } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { newId } from '@domia/kernel';
import { resultOk, resultErr, domiaError, moduleId, brandId } from '@domia/contracts';
import type { Case, CaseContext, CaseCtxConfig, CaseCtxState, ContextId, ModuleResult, SecretRef, TargetSpec, ToolPolicy } from '@domia/contracts';
import { SecretVault } from './secrets.js';
import { authStatePath } from './authCapture.js';

const CASE = moduleId('case');

export class CaseContextImpl implements CaseContext {
  readonly id: ContextId = brandId<'ContextId'>(newId(12));
  readonly case: Case;
  readonly authStatePath?: string;
  private config: CaseCtxConfig = {};
  private disposed = false;

  constructor(
    caseDef: Case,
    readonly resolvedTarget: TargetSpec,
    readonly workdir: string,
    readonly toolPolicy: ToolPolicy,
    private readonly vault: SecretVault,
    authStateFile?: string,
  ) {
    this.case = caseDef;
    if (authStateFile) this.authStatePath = authStateFile;
  }

  configure(patch: Partial<CaseCtxConfig>): ModuleResult<void> {
    this.config = { ...this.config, ...patch };
    return resultOk(undefined);
  }
  inspect(): Readonly<CaseCtxConfig & CaseCtxState> {
    return { ...this.config, caseId: this.case.id };
  }
  secret(ref: SecretRef): ModuleResult<string> {
    if (this.disposed) return resultErr(domiaError(CASE, 'ALREADY_DISPOSED', 'case context disposed'));
    return this.vault.get(ref);
  }
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await rm(this.workdir, { recursive: true, force: true }).catch(() => {});
  }

  static make(c: Case, workroot: string): ModuleResult<CaseContextImpl> {
    const vault = SecretVault.resolveAssets(c.assets);
    if (vault.isErr()) return resultErr(vault.error);
    const workdir = join(workroot, newId(10));
    try { mkdirSync(workdir, { recursive: true }); } catch (e) { return resultErr(domiaError(CASE, 'IO', 'failed to create workdir', { cause: e })); }
    // A login captured earlier (F7) rides along; no capture, no auth — never a failure.
    const auth = authStatePath(workroot, c.id);
    return resultOk(new CaseContextImpl(c, c.target, workdir, c.toolPolicy, vault.value, existsSync(auth) ? auth : undefined));
  }
}
