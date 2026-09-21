import type { ToolManifest } from '@domia/contracts';

/**
 * D19 — LLM function names must match /^[a-zA-Z_][a-zA-Z0-9_]*$/, but our tools
 * are `browser.click`, `plan.start_item`, `user.ask`. A naive dot↔underscore swap
 * is lossy (`plan.start_item` → `plan_start_item` → `plan.start.item`). Keep a
 * reversible map: sanitized → original, built per alloc.
 */
export class NameMap {
  private readonly toOriginal = new Map<string, string>();
  private readonly toSanitized = new Map<string, string>();

  constructor(manifests: readonly ToolManifest[]) {
    for (const m of manifests) {
      let s = m.name.replace(/[^a-zA-Z0-9_]/g, '_');
      if (!/^[a-zA-Z_]/.test(s)) s = `t_${s}`;
      let candidate = s;
      let i = 1;
      while (this.toOriginal.has(candidate)) candidate = `${s}_${i++}`;
      this.toOriginal.set(candidate, m.name);
      this.toSanitized.set(m.name, candidate);
    }
  }

  sanitized(original: string): string {
    return this.toSanitized.get(original) ?? original;
  }
  original(sanitized: string): string {
    return this.toOriginal.get(sanitized) ?? sanitized;
  }
}
