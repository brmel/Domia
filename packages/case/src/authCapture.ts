import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { resultOk, resultErr, domiaError, moduleId } from '@domia/contracts';
import type { AuthCapture, Case, CaseId, ModuleResult, SessionFactory, TargetSession } from '@domia/contracts';

const CASE = moduleId('case');
const POLL_MS = 2_000;
const SETTLED_AFTER_MS = 6_000;
const DEFAULT_BUDGET_MS = 5 * 60_000;

export function authStatePath(workroot: string, caseId: CaseId): string {
  return join(workroot, 'auth', `${caseId}.json`);
}

function cookieCount(authState: string): number {
  try {
    const parsed = JSON.parse(authState) as { cookies?: unknown[] };
    return Array.isArray(parsed.cookies) ? parsed.cookies.length : 0;
  } catch {
    return 0;
  }
}

function notCaptured(reason: string): AuthCapture {
  return { captured: false, notes: [reason] };
}

async function save(authState: string, path: string): Promise<ModuleResult<void>> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, authState, 'utf8');
    return resultOk(undefined);
  } catch (e) {
    return resultErr(domiaError(CASE, 'IO', `failed to write auth state to ${path}`, { cause: e }));
  }
}

async function waitForSettledLogin(session: TargetSession, budgetMs: number): Promise<ModuleResult<string | null>> {
  const deadline = Date.now() + budgetMs;
  let previous = '';
  let unchangedSince = 0;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const current = await session.exportAuthState();
    if (current.isErr()) return resultErr(current.error);
    if (current.value !== previous) {
      previous = current.value;
      unchangedSince = Date.now();
      continue;
    }
    const settled = cookieCount(current.value) > 0 && Date.now() - unchangedSince >= SETTLED_AFTER_MS;
    if (settled) return resultOk(current.value);
  }
  return resultOk(null);
}

export async function captureAuthState(
  c: Case,
  sessions: SessionFactory,
  workroot: string,
  budgetMs = DEFAULT_BUDGET_MS,
): Promise<ModuleResult<AuthCapture>> {
  const opened = await sessions(c.target, { headed: true, interactive: true, record: { video: false, trace: false } });
  if (opened.isErr()) return resultOk(notCaptured(`could not open a headed session: ${opened.error.message}`));

  const session = opened.value;
  try {
    if (!session.inspect().headed) {
      return resultOk(notCaptured('driver could not show a real window; nothing for the human to log into'));
    }
    const settled = await waitForSettledLogin(session, budgetMs);
    if (settled.isErr()) return resultOk(notCaptured(`auth state unreadable: ${settled.error.message}`));
    if (settled.value === null) {
      return resultOk(notCaptured(`no settled login within ${Math.round(budgetMs / 1000)}s`));
    }
    const path = authStatePath(workroot, c.id);
    const saved = await save(settled.value, path);
    if (saved.isErr()) return resultErr(saved.error);
    return resultOk({ captured: true, notes: [`saved ${cookieCount(settled.value)} cookies to ${path}`] });
  } finally {
    await session.dispose();
  }
}
