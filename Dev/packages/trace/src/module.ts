import { join } from 'node:path';
import { resultOk, moduleId, EP } from '@domia/contracts';
import type { DomiaModule, ModuleHost, ModuleResult } from '@domia/contracts';
import { TracerImpl } from './tracer.js';
import { ArtifactStore } from './artifacts.js';
import { JsonlSink } from './sinks/jsonl.js';

const TRACE = moduleId('trace');

export interface TraceModuleOptions {
  readonly artifactsDir: string;
  readonly jsonlPath?: string;
}

/** Core module — loaded first (D4). Registers the real tracer + sinks. */
export function traceModule(opts: TraceModuleOptions): DomiaModule {
  let tracer: TracerImpl | undefined;
  return {
    manifest: { id: TRACE, version: '0.0.0', provides: [EP.Tracer, EP.TraceSink], requires: [] },
    async init(host: ModuleHost): Promise<ModuleResult<void>> {
      const jsonlPath = opts.jsonlPath ?? join(opts.artifactsDir, 'trace.jsonl');
      const sinkReg = host.register(EP.TraceSink, new JsonlSink(jsonlPath));
      if (sinkReg.isErr()) return sinkReg;
      const store = new ArtifactStore(join(opts.artifactsDir, 'blobs'));
      // Resolve sinks live so later-registered sinks (e.g. store's) are included.
      tracer = new TracerImpl(() => host.resolveAll(EP.TraceSink).unwrapOr([]), store);
      const reg = host.register(EP.Tracer, tracer);
      if (reg.isErr()) return reg;
      host.logger.info('trace ready', { jsonl: jsonlPath });
      return resultOk(undefined);
    },
    async dispose(): Promise<void> {
      await tracer?.flush();
    },
  };
}
