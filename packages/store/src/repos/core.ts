import type {
  Case, CaseId, CaseRepo, ExchangeRepo, ExchangeRow, ModuleResult, Page, RunId, RunQuery, RunRepo, RunRow,
} from '@domia/contracts';
import { Db, j, p, type Row } from '../db.js';
import { attempt } from './base.js';

const now = (): string => new Date().toISOString();

function rowToCase(r: Row): Case {
  return {
    id: String(r['id']) as CaseId,
    name: String(r['name']),
    target: p(r['target_json']),
    ...(r['request_template'] ? { requestTemplate: String(r['request_template']) } : {}),
    assets: p(r['assets_json']),
    constraints: p(r['constraints_json']),
    toolPolicy: p(r['tool_policy_json']),
    tags: p(r['tags_json']),
  };
}

export class SqlCaseRepo implements CaseRepo {
  constructor(private readonly db: Db) {}
  insert(c: Case): Promise<ModuleResult<void>> {
    return attempt(() => {
      const t = now();
      this.db.run(
        `INSERT INTO cases (id,name,target_json,request_template,assets_json,constraints_json,tool_policy_json,tags_json,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        c.id, c.name, j(c.target), c.requestTemplate ?? null, j(c.assets), j(c.constraints), j(c.toolPolicy), j(c.tags), t, t,
      );
    });
  }
  update(id: CaseId, patch: Partial<Case>): Promise<ModuleResult<void>> {
    return attempt(() => {
      const cur = this.db.get('SELECT * FROM cases WHERE id=?', id);
      if (!cur) throw new Error(`case '${id}' not found`);
      const merged = { ...rowToCase(cur), ...patch };
      this.db.run(
        `UPDATE cases SET name=?,target_json=?,request_template=?,assets_json=?,constraints_json=?,tool_policy_json=?,tags_json=?,updated_at=? WHERE id=?`,
        merged.name, j(merged.target), merged.requestTemplate ?? null, j(merged.assets), j(merged.constraints), j(merged.toolPolicy), j(merged.tags), now(), id,
      );
    });
  }
  get(id: CaseId): Promise<ModuleResult<Case | null>> {
    return attempt(() => {
      const r = this.db.get('SELECT * FROM cases WHERE id=? AND archived_at IS NULL', id);
      return r ? rowToCase(r) : null;
    });
  }
  list(q?: { tag?: string; text?: string; cursor?: string; limit?: number }): Promise<ModuleResult<Page<Case>>> {
    return attempt(() => {
      const limit = q?.limit ?? 100;
      const rows = this.db.all('SELECT * FROM cases WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT ?', limit);
      const all = rows.map(rowToCase).filter((c) => (q?.tag ? c.tags.includes(q.tag) : true) && (q?.text ? c.name.toLowerCase().includes(q.text.toLowerCase()) : true));
      return { rows: all, total: all.length };
    });
  }
  archive(id: CaseId): Promise<ModuleResult<void>> {
    return attempt(() => this.db.run('UPDATE cases SET archived_at=? WHERE id=?', now(), id));
  }
}

function rowToRun(r: Row): RunRow {
  return {
    id: String(r['id']) as RunId,
    caseId: String(r['case_id']) as RunRow['caseId'],
    ...(r['parent_run_id'] ? { parentRunId: String(r['parent_run_id']) as RunId } : {}),
    persona: String(r['persona']),
    status: String(r['status']) as RunRow['status'],
    request: String(r['request']),
    options: p(r['options_json']),
    ...(r['report_json'] ? { report: p(r['report_json']) } : {}),
    startedAt: String(r['started_at']),
    ...(r['ended_at'] ? { endedAt: String(r['ended_at']) } : {}),
  };
}

export class SqlRunRepo implements RunRepo {
  constructor(private readonly db: Db) {}
  insert(run: RunRow): Promise<ModuleResult<void>> {
    return attempt(() =>
      this.db.run(
        `INSERT INTO runs (id,case_id,parent_run_id,persona,status,request,options_json,report_json,started_at,ended_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        run.id, run.caseId, run.parentRunId ?? null, run.persona, run.status, run.request, j(run.options), run.report ? j(run.report) : null, run.startedAt, run.endedAt ?? null,
      ),
    );
  }
  update(id: RunId, patch: Partial<RunRow>): Promise<ModuleResult<void>> {
    return attempt(() => {
      const cur = this.db.get('SELECT * FROM runs WHERE id=?', id);
      if (!cur) throw new Error(`run '${id}' not found`);
      const m = { ...rowToRun(cur), ...patch };
      this.db.run(
        `UPDATE runs SET status=?,report_json=?,ended_at=? WHERE id=?`,
        m.status, m.report ? j(m.report) : null, m.endedAt ?? null, id,
      );
    });
  }
  get(id: RunId): Promise<ModuleResult<RunRow | null>> {
    return attempt(() => {
      const r = this.db.get('SELECT * FROM runs WHERE id=?', id);
      return r ? rowToRun(r) : null;
    });
  }
  list(q?: RunQuery): Promise<ModuleResult<Page<RunRow>>> {
    return attempt(() => {
      const limit = q?.limit ?? 50;
      const rows = q?.caseId
        ? this.db.all('SELECT * FROM runs WHERE case_id=? ORDER BY started_at DESC LIMIT ?', q.caseId, limit)
        : this.db.all('SELECT * FROM runs ORDER BY started_at DESC LIMIT ?', limit);
      const mapped = rows.map(rowToRun).filter((r) => (q?.status ? r.status === q.status : true));
      return { rows: mapped, total: mapped.length };
    });
  }
  children(parentRunId: RunId): Promise<ModuleResult<readonly RunRow[]>> {
    return attempt(() => this.db.all('SELECT * FROM runs WHERE parent_run_id=? ORDER BY started_at', parentRunId).map(rowToRun));
  }
}

export class SqlExchangeRepo implements ExchangeRepo {
  constructor(private readonly db: Db) {}
  append(row: ExchangeRow): Promise<ModuleResult<void>> {
    return attempt(() =>
      this.db.run('INSERT INTO exchanges (run_id,seq,direction,payload_json,usage_json,at) VALUES (?,?,?,?,?,?)',
        row.runId, row.seq, row.direction, j(row.payload), row.usage ? j(row.usage) : null, row.at),
    );
  }
  listByRun(runId: RunId): Promise<ModuleResult<readonly ExchangeRow[]>> {
    return attempt(() =>
      this.db.all('SELECT * FROM exchanges WHERE run_id=? ORDER BY seq', runId).map((r) => ({
        runId: String(r['run_id']) as RunId,
        seq: Number(r['seq']),
        direction: String(r['direction']) as ExchangeRow['direction'],
        payload: p(r['payload_json']),
        ...(r['usage_json'] ? { usage: p(r['usage_json']) } : {}),
        at: String(r['at']),
      })),
    );
  }
}
