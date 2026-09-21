import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CaseId, MemoryId } from '@domia/contracts';
import { api } from '../api.js';
import { unwrap } from '../bridge.js';

export function MemoryView() {
  const cases = useQuery({ queryKey: ['cases'], queryFn: async () => unwrap(await api.cases.list()) });
  const [picked, setPicked] = useState<CaseId | ''>('');
  const caseId = (picked || cases.data?.rows[0]?.id || '') as CaseId | '';
  return (
    <div className="stack">
      <h1>Memory</h1>
      <p className="muted small">What the agent durably remembers about a target, injected into future runs.</p>
      <select value={caseId} onChange={(e) => setPicked(e.target.value as CaseId)}>
        {cases.data?.rows.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {caseId && <CaseMemories caseId={caseId} />}
    </div>
  );
}

function CaseMemories({ caseId }: { caseId: CaseId }) {
  const qc = useQueryClient();
  const memories = useQuery({ queryKey: ['memories', caseId], queryFn: async () => unwrap(await api.memories.list(caseId)) });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['memories', caseId] });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const save = useMutation({ mutationFn: async () => unwrap(await api.memories.save(caseId, { title, body })), onSuccess: () => { setTitle(''); setBody(''); invalidate(); } });
  const remove = useMutation({ mutationFn: async (id: MemoryId) => unwrap(await api.memories.remove(id)), onSuccess: invalidate });
  return (
    <>
      <form className="row" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <input placeholder="What to remember (never a secret value)" value={body} onChange={(e) => setBody(e.target.value)} required />
        <button type="submit" disabled={save.isPending}>Remember</button>
      </form>
      {memories.data?.length === 0 && <p className="muted small">Nothing remembered for this case yet.</p>}
      <div className="cards">
        {memories.data?.map((m) => (
          <div key={m.id} className="card">
            <div className="card-title">{m.title}</div>
            {m.tags.length > 0 && <div className="muted small">{m.tags.join(', ')}</div>}
            <p>{m.body}</p>
            <button onClick={() => remove.mutate(m.id)}>Remove</button>
          </div>
        ))}
      </div>
    </>
  );
}
