import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuditRunSummary, AuditView, DimensionScore, Finding, RunId, Severity } from '@domia/contracts';
import { api } from '../api.js';
import { unwrap } from '../bridge.js';

const SEVERITY_ORDER: readonly Severity[] = ['blocker', 'serious', 'moderate', 'minor'];

export function AuditsView() {
  const qc = useQueryClient();
  const [url, setUrl] = useState('https://');
  const [openRun, setOpenRun] = useState<RunId | null>(null);

  const audits = useQuery({ queryKey: ['audits'], queryFn: async () => unwrap(await api.audits.list()) });
  const detail = useQuery({
    queryKey: ['audit', openRun],
    queryFn: async () => unwrap(await api.audits.get(openRun!)),
    enabled: openRun !== null,
  });

  const sweep = useMutation({
    mutationFn: async (target: string) => unwrap(await api.audits.sweep(target)),
    onSuccess: (summary) => {
      setOpenRun(summary.runId);
      void qc.invalidateQueries({ queryKey: ['audits'] });
    },
  });

  if (openRun && detail.data) {
    return <AuditDetail view={detail.data} onBack={() => setOpenRun(null)} />;
  }

  return (
    <div className="stack">
      <div className="row between">
        <h1>Audits</h1>
        <div className="row">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" style={{ minWidth: 280 }} />
          <button disabled={sweep.isPending || !url.startsWith('http')} onClick={() => sweep.mutate(url)}>
            {sweep.isPending ? 'Sweeping…' : 'Run sweep'}
          </button>
        </div>
      </div>
      <p className="muted small">
        The sweep is the deterministic pass: files, headers and served HTML across the site&apos;s templates.
        It needs no model and every finding it records carries the bytes that prove it.
      </p>
      {sweep.isError && <div className="error">{String(sweep.error)}</div>}
      <AuditList audits={audits.data ?? []} onOpen={setOpenRun} loading={audits.isLoading} />
    </div>
  );
}

function AuditList({ audits, onOpen, loading }: { audits: readonly AuditRunSummary[]; onOpen: (id: RunId) => void; loading: boolean }) {
  if (loading) return <p className="muted">Loading…</p>;
  if (audits.length === 0) return <p className="muted">No audits yet. Run one above.</p>;
  return (
    <table className="table">
      <thead><tr><th>Target</th><th>Score</th><th>Findings</th><th>Started</th><th>Status</th></tr></thead>
      <tbody>
        {audits.map((a) => (
          <tr key={a.runId} className="clickable" onClick={() => onOpen(a.runId)}>
            <td>{a.target}</td>
            <td>{a.overall !== undefined ? `${a.overall} ${a.grade ?? ''}` : <span className="muted">not assessed</span>}</td>
            <td>{a.findings}</td>
            <td className="small muted">{new Date(a.startedAt).toLocaleString()}</td>
            <td><span className={`status ${a.status}`}>{a.status}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AuditDetail({ view, onBack }: { view: AuditView; onBack: () => void }) {
  const assessed = view.score.dimensions.filter((d) => d.score !== undefined);
  const notAssessed = view.score.dimensions.filter((d) => d.score === undefined);

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <button onClick={onBack}>← Audits</button>
          <h1 style={{ marginBottom: 4 }}>{view.target}</h1>
          <p className="muted small">
            {view.score.overall !== undefined
              ? `Overall ${view.score.overall} (${view.score.grade}) across ${view.score.assessed} assessed dimensions · ${view.findings.length} findings`
              : `No dimension assessed · ${view.findings.length} findings`}
          </p>
        </div>
      </div>

      <div className="cards">
        {assessed.map((d) => <DimensionCard key={d.dimension} score={d} />)}
      </div>

      {notAssessed.length > 0 && (
        <p className="muted small">
          Not assessed: {notAssessed.map((d) => d.title).join(' · ')}. A missing score is not a pass.
        </p>
      )}

      {SEVERITY_ORDER.map((severity) => {
        const group = view.findings.filter((f) => f.severity === severity);
        if (group.length === 0) return null;
        return (
          <section key={severity} className="stack">
            <h2 style={{ marginBottom: 0 }}>{severity} ({group.length})</h2>
            {group.map((f) => <FindingCard key={f.id} finding={f} />)}
          </section>
        );
      })}
    </div>
  );
}

function DimensionCard({ score }: { score: DimensionScore }) {
  const coverage = score.coverage.applicable > 0
    ? Math.round((score.coverage.executed / score.coverage.applicable) * 100)
    : 0;
  return (
    <div className="card">
      <div className="row between">
        <span className="card-title">{score.title}</span>
        <span className={`score-badge grade-${score.grade}`}>{score.score} {score.grade}</span>
      </div>
      <div className="meter"><span style={{ width: `${score.score}%` }} /></div>
      <div className="small muted">
        coverage {coverage}% ({score.coverage.executed}/{score.coverage.applicable})
        {score.cappedByBlocker && <strong className="error"> · capped by a blocker</strong>}
      </div>
      <div className="small muted">
        {SEVERITY_ORDER.map((s) => `${score.counts[s]} ${s}`).join(' · ')}
      </div>
      <div className="small muted">
        penalty — verified {score.split.verified} · judged {score.split.probable} · needs human {score.split.needsHuman}
      </div>
      {score.coverage.notes && <div className="small muted">{score.coverage.notes}</div>}
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <div className="card">
      <div className="row between">
        <span className="card-title">{finding.title}</span>
        <span className="small muted">{finding.dimension} · {finding.check}</span>
      </div>
      <div className="small">
        <span className={`status ${finding.confidence === 'verified' ? 'ok' : 'suspended'}`}>{finding.confidence}</span>
        {' '}<span className="muted">via {finding.source} · {finding.where.url}</span>
        {finding.reach.sampled > 1 && <span className="muted"> · {finding.reach.affected}/{finding.reach.sampled} sampled pages</span>}
        {finding.where.template && <span className="muted"> · template {finding.where.template}</span>}
      </div>
      <p style={{ margin: 0 }}>{finding.detail}</p>
      <div className="fix">
        <strong>Fix ({finding.remediation.effort} effort, {finding.remediation.impact} impact).</strong> {finding.remediation.summary}
        <div className="small muted">Verify: {finding.remediation.verification}</div>
        {finding.remediation.patch && <pre className="snippet">{finding.remediation.patch.snippet}</pre>}
      </div>
      {finding.standards.length > 0 && <div className="small muted">{finding.standards.join(' · ')}</div>}
      {finding.observed && <details><summary className="small muted">Evidence</summary><pre className="snippet">{finding.observed}</pre></details>}
    </div>
  );
}
