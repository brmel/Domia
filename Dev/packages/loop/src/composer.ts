import type { ToolManifest, ToolsetSelector, ToolPolicy } from '@domia/contracts';

function matches(name: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => (p.endsWith('*') ? name.startsWith(p.slice(0, -1)) : name === p));
}

/** D7/F11 — merge target ∪ plan ∪ meta manifests, gate by persona selector ∩ case policy. */
export function composeToolset(
  selector: ToolsetSelector,
  target: readonly ToolManifest[],
  planTools: readonly ToolManifest[],
  metaTools: readonly ToolManifest[],
  policy: ToolPolicy,
): readonly ToolManifest[] {
  let all: ToolManifest[];
  switch (selector) {
    case 'no-target': all = [...planTools, ...metaTools]; break;
    case 'observe-only': all = [...target.filter((m) => /observe|snapshot|screenshot/.test(m.name)), ...planTools, ...metaTools]; break;
    case 'full': all = [...target, ...planTools, ...metaTools]; break;
    default: {
      const names = selector as readonly string[];
      all = [...target, ...planTools, ...metaTools].filter((m) => matches(m.name, names));
    }
  }
  return all.filter((m) => {
    if (policy.deny && matches(m.name, policy.deny)) return false;
    if (policy.allow && !matches(m.name, policy.allow)) return false;
    return true;
  });
}

