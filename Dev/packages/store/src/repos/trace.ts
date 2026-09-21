import type {
  ArtifactId, ArtifactIndexRepo, ArtifactIndexRow, EventRow, ModuleResult, RunId, SnapshotRepo, SnapshotRow,
  SpanId, SpanRow, TraceId, TraceRepo,
} from '@domia/contracts';
import { Db, j, p, type Row } from '../db.js';
import { attempt } from './base.js';

function rowToSpan(r: Row): SpanRow {
  return {
    spanId: String(r['span_id']) as SpanId,
    traceId: String(r['trace_id']) as TraceId,
    ...(r['parent_span_id'] ? { parentSpanId: String(r['parent_span_id']) as SpanId } : {}),
    ...(r['run_id'] ? { runId: String(r['run_id']) as RunId } : {}),
    name: String(r['name']),
    attrs: p(r['attrs_json']),
    status: String(r['status']) as SpanRow['status'],
    ...(r['cost_json'] ? { cost: p(r['cost_json']) } : {}),
    startedAt: String(r['started_at']),
    endedAt: String(r['ended_at']),
  };
}

export class SqlTraceRepo implements TraceRepo {
  constructor(private readonly db: Db) {}
  insertSpan(s: SpanRow): Promise<ModuleResult<void>> {
    return attempt(() =>
      this.db.run(
        `INSERT OR REPLACE INTO trace_spans (span_id,trace_id,parent_span_id,run_id,name,attrs_json,status,cost_json,started_at,ended_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        s.spanId, s.traceId, s.parentSpanId ?? null, s.runId ?? null, s.name, j(s.attrs), s.status, s.cost ? j(s.cost) : null, s.startedAt, s.endedAt,
      ),
    );
  }
  insertEvent(e: EventRow): Promise<ModuleResult<void>> {
    return attempt(() =>
      this.db.run('INSERT INTO trace_events (span_id,run_id,name,attrs_json,at) VALUES (?,?,?,?,?)',
        e.spanId ?? null, e.runId ?? null, e.name, j(e.attrs), e.at),
    );
  }
  spansByRun(runId: RunId): Promise<ModuleResult<readonly SpanRow[]>> {
    return attempt(() => this.db.all('SELECT * FROM trace_spans WHERE run_id=? ORDER BY started_at', runId).map(rowToSpan));
  }
}

export class SqlArtifactIndexRepo implements ArtifactIndexRepo {
  constructor(private readonly db: Db) {}
  private map(r: Row): ArtifactIndexRow {
    return {
      id: String(r['id']) as ArtifactId, ...(r['run_id'] ? { runId: String(r['run_id']) as RunId } : {}),
      kind: String(r['kind']), mime: String(r['mime']), bytes: Number(r['bytes']), sha256: String(r['sha256']),
      path: String(r['path']), ...(r['label'] ? { label: String(r['label']) } : {}), at: String(r['at']),
    };
  }
  index(row: ArtifactIndexRow): Promise<ModuleResult<void>> {
    return attempt(() =>
      this.db.run('INSERT OR IGNORE INTO artifacts (id,run_id,kind,mime,bytes,sha256,path,label,at) VALUES (?,?,?,?,?,?,?,?,?)',
        row.id, row.runId ?? null, row.kind, row.mime, row.bytes, row.sha256, row.path, row.label ?? null, row.at),
    );
  }
  bySha(sha256: string): Promise<ModuleResult<ArtifactIndexRow | null>> {
    return attempt(() => { const r = this.db.get('SELECT * FROM artifacts WHERE sha256=?', sha256); return r ? this.map(r) : null; });
  }
  byRun(runId: RunId): Promise<ModuleResult<readonly ArtifactIndexRow[]>> {
    return attempt(() => this.db.all('SELECT * FROM artifacts WHERE run_id=? ORDER BY at', runId).map((r) => this.map(r)));
  }
  byId(id: ArtifactId): Promise<ModuleResult<ArtifactIndexRow | null>> {
    return attempt(() => { const r = this.db.get('SELECT * FROM artifacts WHERE id=?', id); return r ? this.map(r) : null; });
  }
}

export class SqlSnapshotRepo implements SnapshotRepo {
  constructor(private readonly db: Db) {}
  save(row: SnapshotRow): Promise<ModuleResult<void>> {
    return attempt(() => this.db.run('INSERT OR REPLACE INTO snapshots (run_id,provider,blob_path,at) VALUES (?,?,?,?)', row.runId, row.provider, row.blobPath, row.at));
  }
  load(runId: RunId): Promise<ModuleResult<SnapshotRow | null>> {
    return attempt(() => {
      const r = this.db.get('SELECT * FROM snapshots WHERE run_id=?', runId);
      return r ? { runId: String(r['run_id']) as RunId, provider: String(r['provider']), blobPath: String(r['blob_path']), at: String(r['at']) } : null;
    });
  }
}
