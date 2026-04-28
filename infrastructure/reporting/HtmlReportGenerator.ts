import type { IReportGenerator, RunReport } from '@domain/ports/IReportGenerator';

function esc(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class HtmlReportGenerator implements IReportGenerator {
    readonly format = 'html';

    generate(report: RunReport): string {
        const { run, steps } = report;
        const status = run.status;
        const statusLabel = status.type;
        const duration = 'duration' in status ? `${(status.duration / 1000).toFixed(1)}s` : 'N/A';
        const statusColor = status.type === 'passed' ? '#22c55e' : status.type === 'failed' ? '#ef4444' : '#eab308';

        const stepRows = steps.map(s => `
      <tr>
        <td>${s.stepNumber}</td>
        <td>${esc(s.actionType)}</td>
        <td>${esc(s.timestamp)}</td>
      </tr>`).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Domia Report — ${esc(run.id)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #1e293b; }
  h1 { font-size: 1.5rem; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 4px; color: #fff; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
  th { background: #f8fafc; }
  .meta { color: #64748b; font-size: 0.9rem; margin: 0.25rem 0; }
</style>
</head>
<body>
<h1>Domia Run Report</h1>
<p class="meta"><strong>Run ID:</strong> ${esc(run.id)}</p>
<p class="meta"><strong>URL:</strong> ${esc(String(run.url))}</p>
<p class="meta"><strong>Prompt:</strong> ${esc(run.prompt)}</p>
<p class="meta"><strong>Status:</strong> <span class="badge" style="background:${statusColor}">${esc(statusLabel)}</span></p>
<p class="meta"><strong>Duration:</strong> ${esc(duration)}</p>
${status.type === 'failed' ? `<p class="meta" style="color:#ef4444"><strong>Error:</strong> ${esc(status.error)}</p>` : ''}
${status.type === 'passed' ? `<p class="meta"><strong>Summary:</strong> ${esc(status.summary)}</p>` : ''}
<h2>Steps (${steps.length})</h2>
${steps.length === 0 ? '<p class="meta">No steps recorded.</p>' : `
<table>
  <thead><tr><th>#</th><th>Action</th><th>Timestamp</th></tr></thead>
  <tbody>${stepRows}</tbody>
</table>`}
</body>
</html>`;
    }
}
