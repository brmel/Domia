import type { LoopRunView, MetaToolHandler, ToolManifest } from '@domia/contracts';
import { suite, testCase, assert, type TestSuite } from './kit.js';

function assertManifest(m: ToolManifest): void {
  assert(typeof m.name === 'string' && m.name.length > 0, 'manifest.name must be a non-empty string');
  assert(m.parameters != null && typeof (m.parameters as { safeParse?: unknown }).safeParse === 'function', `'${m.name}': parameters must be a Zod schema`);
  assert(m.output != null && typeof (m.output as { safeParse?: unknown }).safeParse === 'function', `'${m.name}': output must be a Zod schema`);
  assert(Array.isArray(m.capabilities), `'${m.name}': capabilities must be an array`);
  assert(['safe', 'guarded', 'dangerous'].includes(m.risk), `'${m.name}': risk must be safe|guarded|dangerous`);
}

/** Any belt tool — built-in or third-party — must pass this. */
export function metaToolKit(make: () => MetaToolHandler, view: LoopRunView): TestSuite {
  return suite('MetaToolHandler', [
    testCase('manifests are well-formed tool definitions', async () => {
      for (const m of make().manifests(view)) assertManifest(m);
    }),
    testCase('manifests are deterministic for a given run view', async () => {
      const h = make();
      const a = h.manifests(view).map((m) => m.name);
      const b = h.manifests(view).map((m) => m.name);
      assert(JSON.stringify(a) === JSON.stringify(b), 'manifests must be stable for the same view');
    }),
  ]);
}
