import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { unwrap } from '../bridge.js';

export function SettingsView() {
  const qc = useQueryClient();
  const providers = useQuery({ queryKey: ['providers'], queryFn: async () => unwrap(await api.agents.providers()) });
  const settings = useQuery({ queryKey: ['settings'], queryFn: async () => unwrap(await api.settings.get()) });
  const patch = useMutation({
    mutationFn: async (p: Record<string, unknown>) => unwrap(await api.settings.patch(p)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['settings'] }),
  });
  const theme = (settings.data?.['theme'] as string | undefined) ?? 'dark';
  return (
    <div className="stack">
      <h1>Settings</h1>
      <section>
        <h3>Model providers</h3>
        <ul>{providers.data?.map((p) => <li key={p.id}>{p.id}</li>)}</ul>
      </section>
      <section>
        <h3>Theme</h3>
        <select value={theme} onChange={(e) => patch.mutate({ theme: e.target.value })}>
          <option value="dark">dark</option>
          <option value="light">light</option>
        </select>
      </section>
    </div>
  );
}
