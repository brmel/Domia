import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { composeToolset } from '@domia/loop';
import type { ToolManifest } from '@domia/contracts';

const tool = (name: string): ToolManifest => ({ name, description: name, parameters: z.object({}), output: z.unknown(), capabilities: ['meta'], risk: 'safe' });
const target = [tool('browser.click'), tool('browser.snapshot'), tool('shell.exec')];
const planTools = [tool('plan.propose'), tool('plan.complete_item')];
const meta = [tool('user.ask'), tool('agent.spawn')];
const names = (m: readonly ToolManifest[]) => m.map((x) => x.name);

describe('F11 — tool policy over the merged catalog', () => {
  it('full selector merges target ∪ plan ∪ meta', () => {
    const out = names(composeToolset('full', target, planTools, meta, {}));
    expect(out).toEqual(expect.arrayContaining(['browser.click', 'plan.propose', 'user.ask', 'agent.spawn']));
  });

  it('deny globs remove tools from whatever the selector offered', () => {
    const out = names(composeToolset('full', target, planTools, meta, { deny: ['shell.*', 'agent.*'] }));
    expect(out).not.toContain('shell.exec');
    expect(out).not.toContain('agent.spawn');
    expect(out).toContain('browser.click');
  });

  it('allow globs restrict the catalog to an explicit set', () => {
    const out = names(composeToolset('full', target, planTools, meta, { allow: ['plan.*', 'browser.snapshot'] }));
    expect(out.sort()).toEqual(['browser.snapshot', 'plan.complete_item', 'plan.propose']);
  });

  it('observe-only drops acting target tools but keeps observation + plan + meta', () => {
    const out = names(composeToolset('observe-only', target, planTools, meta, {}));
    expect(out).toContain('browser.snapshot');
    expect(out).not.toContain('browser.click');
    expect(out).toContain('plan.propose');
  });

  it('no-target removes all target tools', () => {
    const out = names(composeToolset('no-target', target, planTools, meta, {}));
    expect(out.some((n) => n.startsWith('browser.'))).toBe(false);
    expect(out).toContain('user.ask');
  });

  it('a persona name-list selector filters by glob, then policy applies on top', () => {
    const out = names(composeToolset(['plan.*', 'browser.*'], target, planTools, meta, { deny: ['browser.click'] }));
    expect(out).toContain('plan.propose');
    expect(out).toContain('browser.snapshot');
    expect(out).not.toContain('browser.click'); // policy wins over the selector
    expect(out).not.toContain('user.ask'); // not in the persona's list
  });
});
