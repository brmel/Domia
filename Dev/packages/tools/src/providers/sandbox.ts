import { resolve, relative, isAbsolute } from 'node:path';
import { resultOk, resultErr, domiaError, moduleId } from '@domia/contracts';
import type { ModuleResult } from '@domia/contracts';

const TOOLS = moduleId('tools');

/**
 * The filesystem boundary for host-side providers (shell, files). Every path the
 * agent supplies is resolved against the case workdir and rejected if it escapes
 * — the agent is free, the blast radius is not.
 */
export class Sandbox {
  constructor(readonly root: string) {}

  /** Resolve `p` inside the root, or reject traversal / absolute escapes. */
  contain(p: string | undefined): ModuleResult<string> {
    const candidate = p === undefined || p === '' ? this.root : resolve(this.root, p);
    const rel = relative(this.root, candidate);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return resultErr(domiaError(TOOLS, 'INVALID_ARGS', `path '${p}' escapes the case workdir`));
    }
    return resultOk(candidate);
  }
}

export const MAX_OUTPUT_BYTES = 100_000;

/** Cap oversized output so one command can't flood the model's context. */
export function capText(text: string, max = MAX_OUTPUT_BYTES): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated ${text.length - max} chars]`;
}
