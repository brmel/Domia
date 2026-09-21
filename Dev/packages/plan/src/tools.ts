import { z } from 'zod';
import { resultOk, resultErr, domiaError, moduleId, brandId } from '@domia/contracts';
import type { ItemId, ModuleResult, PlanOp, ToolCall, ToolManifest } from '@domia/contracts';

const PLAN = moduleId('plan');
const itemId = (s: unknown): ItemId => brandId<'ItemId'>(String(s));

/** The plan.* belt offered to the agent. Each maps 1:1 to a PlanOp. */
export const PLAN_TOOLS: readonly ToolManifest[] = [
  { name: 'plan.propose', description: 'Lay out (or fully re-plan) your intended steps as a list. Keeps completed items.', parameters: z.object({ items: z.array(z.object({ title: z.string(), intent: z.string().describe('what "done" means for this step') })) }), output: z.unknown(), capabilities: ['meta'], risk: 'safe' },
  { name: 'plan.add_item', description: 'Add one step to the plan.', parameters: z.object({ title: z.string(), intent: z.string(), afterSeq: z.number().optional() }), output: z.unknown(), capabilities: ['meta'], risk: 'safe' },
  { name: 'plan.start_item', description: 'Mark a plan item as the one you are working on now.', parameters: z.object({ itemId: z.string() }), output: z.unknown(), capabilities: ['meta'], risk: 'safe' },
  { name: 'plan.complete_item', description: 'Mark a plan item done, with a short evidence note.', parameters: z.object({ itemId: z.string(), note: z.string().optional() }), output: z.unknown(), capabilities: ['meta'], risk: 'safe' },
  { name: 'plan.drop_item', description: 'Abandon a plan item, with a reason.', parameters: z.object({ itemId: z.string(), reason: z.string() }), output: z.unknown(), capabilities: ['meta'], risk: 'safe' },
  { name: 'plan.note', description: 'Record a free-form note about the plan.', parameters: z.object({ text: z.string() }), output: z.unknown(), capabilities: ['meta'], risk: 'safe' },
];

/** Translate a plan.* tool call into a PlanOp. */
export function callToOp(call: ToolCall): ModuleResult<PlanOp> {
  const a = call.args;
  switch (call.name) {
    case 'plan.propose': return resultOk({ op: 'propose', items: (a['items'] ?? []) as { title: string; intent: string }[] });
    case 'plan.add_item': return resultOk({ op: 'add', title: String(a['title']), intent: String(a['intent']), ...(a['afterSeq'] !== undefined ? { afterSeq: Number(a['afterSeq']) } : {}) });
    case 'plan.start_item': return resultOk({ op: 'start', itemId: itemId(a['itemId']) });
    case 'plan.complete_item': return resultOk({ op: 'complete', itemId: itemId(a['itemId']), ...(a['note'] ? { note: String(a['note']) } : {}) });
    case 'plan.drop_item': return resultOk({ op: 'drop', itemId: itemId(a['itemId']), reason: String(a['reason']) });
    case 'plan.note': return resultOk({ op: 'note', text: String(a['text']) });
    default: return resultErr(domiaError(PLAN, 'UNKNOWN_TOOL', `not a plan tool: '${call.name}'`));
  }
}
