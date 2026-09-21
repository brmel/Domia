import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Case, CaseId } from '@domia/contracts';
import { api } from '../api.js';
import { unwrap } from '../bridge.js';
import { useNav } from '../store.js';

export function CasesView() {
  const cases = useQuery({ queryKey: ['cases'], queryFn: async () => unwrap(await api.cases.list()) });
  return (
    <div className="stack">
      <h1>Cases</h1>
      <CreateCase />
      {cases.isLoading && <p className="muted">Loading…</p>}
      {cases.error && <p className="error">{String(cases.error)}</p>}
      <div className="cards">
        {cases.data?.rows.map((c) => <CaseCard key={c.id} kase={c} />)}
      </div>
    </div>
  );
}

function CreateCase() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const create = useMutation({
    mutationFn: async () => unwrap(await api.cases.create({ name, target: { kind: 'web', url } })),
    onSuccess: () => { setName(''); setUrl(''); void qc.invalidateQueries({ queryKey: ['cases'] }); },
  });
  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
      <input placeholder="Case name" value={name} onChange={(e) => setName(e.target.value)} required />
      <input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} required />
      <button type="submit" disabled={create.isPending}>Add case</button>
      {create.error && <span className="error">{String(create.error)}</span>}
    </form>
  );
}

function CaseCard({ kase }: { kase: Case }) {
  const openRun = useNav((s) => s.openRun);
  const [request, setRequest] = useState('');
  const launch = useMutation({
    mutationFn: async (caseId: CaseId) => unwrap(await api.runs.start(caseId, request)),
    onSuccess: (runId) => openRun(runId),
  });
  return (
    <div className="card">
      <div className="card-title">{kase.name}</div>
      <div className="muted small">{kase.target.kind === 'web' ? kase.target.url : kase.target.kind}</div>
      <textarea placeholder="What should the agent do?" value={request} onChange={(e) => setRequest(e.target.value)} />
      <button disabled={!request.trim() || launch.isPending} onClick={() => launch.mutate(kase.id)}>
        {launch.isPending ? 'Launching…' : 'Launch run'}
      </button>
      {launch.error && <span className="error">{String(launch.error)}</span>}
    </div>
  );
}
