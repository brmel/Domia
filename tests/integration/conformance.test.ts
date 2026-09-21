import { tmpDir } from './harness.js';
import { describe, it } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { NoopTracer } from '@domia/kernel';
import { ReplayProvider } from '@domia/agent';
import { JsonlSink } from '@domia/trace';
import { builtinMetaHandlers } from '@domia/loop';
import { agentProviderKit, metaToolKit, traceSinkKit, type TestSuite } from '@domia/conformance';
import { brandId } from '@domia/contracts';
import type { AgentTurn, LoopRunView } from '@domia/contracts';

/** Turn a framework-agnostic conformance suite into vitest cases. */
function run(s: TestSuite): void {
  describe(`conformance / ${s.name}`, () => { for (const c of s.cases) it(c.name, () => c.run()); });
}

const SCRIPT: AgentTurn[] = [{ kind: 'act', calls: [{ name: 'x', args: {} }] }, { kind: 'final', summary: 'done' }];
run(agentProviderKit(() => new ReplayProvider(() => SCRIPT, new NoopTracer())));

const view: LoopRunView = { runId: brandId<'RunId'>('confRun'), options: {}, capabilities: [], request: 'conformance' };
run(metaToolKit(() => builtinMetaHandlers[0]!, view));

const dir = tmpDir('conf');
run(traceSinkKit(() => new JsonlSink(join(dir, 'trace.jsonl'))));
// The temp dir leaks intentionally past the last flush; a process-level cleanup is enough.
process.on('exit', () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
