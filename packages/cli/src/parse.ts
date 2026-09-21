import { parseModelRef, parseModelSpec } from '@domia/hosts';
import type { ModelRef, ModelSpec } from '@domia/contracts';

export function parseModel(s: string): { ok: true; ref: ModelRef } | { ok: false; error: string } {
  const parsed = parseModelRef(s);
  return parsed.isOk() ? { ok: true, ref: parsed.value } : { ok: false, error: parsed.error.message };
}

export function parseModelChain(s: string): { ok: true; spec: ModelSpec } | { ok: false; error: string } {
  const parsed = parseModelSpec(s);
  return parsed.isOk() ? { ok: true, spec: parsed.value } : { ok: false, error: parsed.error.message };
}

export function parseUrl(s: string): { ok: true; url: string } | { ok: false; error: string } {
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: `--url must be http(s), got '${u.protocol}'` };
    return { ok: true, url: s };
  } catch {
    return { ok: false, error: `invalid --url '${s}'` };
  }
}

export function parsePositiveInt(s: string, fallback: number): number {
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
