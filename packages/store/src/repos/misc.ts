import type {
  CaseId, MemoryId, MemoryRepo, MemoryRow, ModuleResult, PlanId, PlanItemRow, PlanRepo, PlanRevisionRow, PlanRow,
  RunId, ScheduleId, ScheduleRepo, ScheduleRow, SettingsRepo,
} from '@domia/contracts';
import { Db, j, p, bool, type Row } from '../db.js';
import { attempt } from './base.js';

export class SqlPlanRepo implements PlanRepo {
  constructor(private readonly db: Db) {}
  upsert(plan: PlanRow, items: readonly PlanItemRow[]): Promise<ModuleResult<void>> {
    return attempt(() =>
      this.db.tx(() => {
        this.db.run('INSERT OR REPLACE INTO plans (id,run_id,goal,revision,status,updated_at) VALUES (?,?,?,?,?,?)',
          plan.id, plan.runId, plan.goal, plan.revision, plan.status, plan.updatedAt);
        this.db.run('DELETE FROM plan_items WHERE plan_id=?', plan.id);
        for (const it of items)
          this.db.run('INSERT INTO plan_items (id,plan_id,seq,title,intent,status,note) VALUES (?,?,?,?,?,?,?)',
            it.id, it.planId, it.seq, it.title, it.intent, it.status, it.note ?? null);
      }),
    );
  }
  get(runId: RunId): Promise<ModuleResult<{ plan: PlanRow; items: readonly PlanItemRow[] } | null>> {
    return attempt(() => {
      const pr = this.db.get('SELECT * FROM plans WHERE run_id=?', runId);
      if (!pr) return null;
      const plan: PlanRow = { id: String(pr['id']) as PlanId, runId, goal: String(pr['goal']), revision: Number(pr['revision']), status: String(pr['status']), updatedAt: String(pr['updated_at']) };
      const items = this.db.all('SELECT * FROM plan_items WHERE plan_id=? ORDER BY seq', plan.id).map((r: Row): PlanItemRow => ({
        planId: plan.id, id: String(r['id']) as PlanItemRow['id'], seq: Number(r['seq']), title: String(r['title']),
        intent: String(r['intent']), status: String(r['status']) as PlanItemRow['status'], ...(r['note'] ? { note: String(r['note']) } : {}),
      }));
      return { plan, items };
    });
  }
  appendRevision(rev: PlanRevisionRow): Promise<ModuleResult<void>> {
    return attempt(() => this.db.run('INSERT OR REPLACE INTO plan_revisions (plan_id,revision,op_json,origin,at) VALUES (?,?,?,?,?)', rev.planId, rev.revision, j(rev.op), rev.origin, rev.at));
  }
  history(planId: PlanId): Promise<ModuleResult<readonly PlanRevisionRow[]>> {
    return attempt(() => this.db.all('SELECT * FROM plan_revisions WHERE plan_id=? ORDER BY revision', planId).map((r): PlanRevisionRow => ({
      planId, revision: Number(r['revision']), op: p(r['op_json']), origin: String(r['origin']) as 'agent' | 'user', at: String(r['at']),
    })));
  }
}

export class SqlMemoryRepo implements MemoryRepo {
  constructor(private readonly db: Db) {}
  private map(r: Row): MemoryRow {
    return { id: String(r['id']) as MemoryId, caseId: String(r['case_id']) as CaseId, title: String(r['title']), tags: p(r['tags_json']), bodyPath: String(r['body_path']), createdAt: String(r['created_at']), updatedAt: String(r['updated_at']) };
  }
  insert(row: MemoryRow): Promise<ModuleResult<void>> {
    return attempt(() => this.db.run('INSERT INTO memories (id,case_id,title,tags_json,body_path,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', row.id, row.caseId, row.title, j(row.tags), row.bodyPath, row.createdAt, row.updatedAt));
  }
  update(id: MemoryId, patch: Partial<MemoryRow>): Promise<ModuleResult<void>> {
    return attempt(() => {
      const cur = this.db.get('SELECT * FROM memories WHERE id=?', id);
      if (!cur) throw new Error(`memory '${id}' not found`);
      const m = { ...this.map(cur), ...patch };
      this.db.run('UPDATE memories SET title=?,tags_json=?,body_path=?,updated_at=? WHERE id=?', m.title, j(m.tags), m.bodyPath, new Date().toISOString(), id);
    });
  }
  byCase(caseId: CaseId): Promise<ModuleResult<readonly MemoryRow[]>> {
    return attempt(() => this.db.all('SELECT * FROM memories WHERE case_id=? ORDER BY updated_at DESC', caseId).map((r) => this.map(r)));
  }
  remove(id: MemoryId): Promise<ModuleResult<void>> {
    return attempt(() => this.db.run('DELETE FROM memories WHERE id=?', id));
  }
}

export class SqlScheduleRepo implements ScheduleRepo {
  constructor(private readonly db: Db) {}
  private map(r: Row): ScheduleRow {
    return { id: String(r['id']) as ScheduleId, caseId: String(r['case_id']) as CaseId, cron: String(r['cron']), request: String(r['request']), options: p(r['options_json']), enabled: Number(r['enabled']) === 1, ...(r['last_run_id'] ? { lastRunId: String(r['last_run_id']) as RunId } : {}), ...(r['next_at'] ? { nextAt: String(r['next_at']) } : {}), createdAt: String(r['created_at']) };
  }
  insert(row: ScheduleRow): Promise<ModuleResult<void>> {
    return attempt(() => this.db.run('INSERT INTO schedules (id,case_id,cron,request,options_json,enabled,last_run_id,next_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)', row.id, row.caseId, row.cron, row.request, j(row.options), bool(row.enabled), row.lastRunId ?? null, row.nextAt ?? null, row.createdAt));
  }
  update(id: ScheduleId, patch: Partial<ScheduleRow>): Promise<ModuleResult<void>> {
    return attempt(() => {
      const cur = this.db.get('SELECT * FROM schedules WHERE id=?', id);
      if (!cur) throw new Error(`schedule '${id}' not found`);
      const m = { ...this.map(cur), ...patch };
      this.db.run('UPDATE schedules SET enabled=?,last_run_id=?,next_at=? WHERE id=?', bool(m.enabled), m.lastRunId ?? null, m.nextAt ?? null, id);
    });
  }
  listEnabled(): Promise<ModuleResult<readonly ScheduleRow[]>> {
    return attempt(() => this.db.all('SELECT * FROM schedules WHERE enabled=1 ORDER BY next_at').map((r) => this.map(r)));
  }
  remove(id: ScheduleId): Promise<ModuleResult<void>> {
    return attempt(() => this.db.run('DELETE FROM schedules WHERE id=?', id));
  }
}

export class SqlSettingsRepo implements SettingsRepo {
  constructor(private readonly db: Db) {}
  get(key: string): Promise<ModuleResult<unknown>> {
    return attempt(() => { const r = this.db.get('SELECT value_json FROM settings WHERE key=?', key); return r ? p(r['value_json']) : null; });
  }
  patch(key: string, value: unknown): Promise<ModuleResult<void>> {
    return attempt(() => this.db.run('INSERT OR REPLACE INTO settings (key,value_json,updated_at) VALUES (?,?,?)', key, j(value), new Date().toISOString()));
  }
}
