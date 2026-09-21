import { newId } from '@domia/kernel';
import { brandId } from '@domia/contracts';
import type { ItemId, Plan, PlanDiff, PlanItem, PlanOp } from '@domia/contracts';

function reseq(items: readonly PlanItem[]): PlanItem[] {
  return items.map((it, i) => ({ ...it, seq: i }));
}
function statusOf(items: readonly PlanItem[]): Plan['status'] {
  if (items.length === 0) return 'empty';
  return items.every((i) => i.status === 'done' || i.status === 'dropped') ? 'settled' : 'active';
}

/** Pure transition: (plan, op) → next plan + diff. The only place plan state changes. */
export function applyOp(plan: Plan, op: PlanOp): { plan: Plan; diff: PlanDiff } {
  const changed: ItemId[] = [];
  let items = [...plan.items];

  const patch = (id: ItemId, fn: (it: PlanItem) => PlanItem): void => {
    items = items.map((it) => (it.id === id ? (changed.push(id), fn(it)) : it));
  };
  const newItem = (title: string, intent: string): PlanItem => {
    const id = brandId<'ItemId'>(newId(8));
    changed.push(id);
    return { id, seq: items.length, title, intent, status: 'pending' };
  };

  switch (op.op) {
    case 'propose': {
      const keep = items.filter((i) => i.status === 'done' || i.status === 'dropped');
      items = reseq([...keep, ...op.items.map((i) => newItem(i.title, i.intent))]);
      break;
    }
    case 'add': {
      const it = newItem(op.title, op.intent);
      if (op.afterSeq === undefined) items = reseq([...items, it]);
      else { const at = items.findIndex((x) => x.seq === op.afterSeq); items = reseq([...items.slice(0, at + 1), it, ...items.slice(at + 1)]); }
      break;
    }
    case 'start': patch(op.itemId, (it) => ({ ...it, status: 'active' })); break;
    case 'complete': patch(op.itemId, (it) => ({ ...it, status: 'done', ...(op.note ? { note: op.note } : {}) })); break;
    case 'drop': patch(op.itemId, (it) => ({ ...it, status: 'dropped', note: op.reason })); break;
    case 'note': break; // plan-level annotation lives in the revision log, no item change
    case 'revise': {
      let cur = plan;
      const allChanged: ItemId[] = [];
      for (const sub of op.ops) { const r = applyOp(cur, sub); cur = r.plan; allChanged.push(...r.diff.changed); }
      return { plan: cur, diff: { changed: allChanged, summary: `revise (${op.ops.length} ops)` } };
    }
  }

  const next: Plan = { ...plan, items, revision: plan.revision + 1, status: statusOf(items) };
  return { plan: next, diff: { changed: [...new Set(changed)], summary: summarize(op) } };
}

function summarize(op: PlanOp): string {
  switch (op.op) {
    case 'propose': return `proposed ${op.items.length} items`;
    case 'add': return `added "${op.title}"`;
    case 'start': return 'started an item';
    case 'complete': return 'completed an item';
    case 'drop': return 'dropped an item';
    case 'note': return `note: ${op.text.slice(0, 60)}`;
    case 'revise': return 'revised';
  }
}
