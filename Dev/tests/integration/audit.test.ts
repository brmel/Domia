import { describe, it, expect, afterEach } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { bootHeadless, startRun } from '@domia/hosts';
import { EP } from '@domia/contracts';
import type { AgentTurn, Finding, ModelRef } from '@domia/contracts';
import type { Kernel } from '@domia/kernel';
import { scoreAudit, findingWeight, grade } from '@domia/audit';
import { must, tmpDir } from './harness.js';

const REPLAY: ModelRef = { provider: 'replay', model: 'scripted' };

function finding(over: Partial<Finding> = {}): Finding {
  return {
    id: 'f1', runId: 'r1', recordedAt: new Date().toISOString(),
    dimension: 'accessibility', check: 'a11y.contrast', title: 'Low contrast', detail: '2.1:1',
    severity: 'serious', confidence: 'verified', source: 'axe', standards: [],
    where: { url: 'https://example.com' }, reach: { affected: 1, sampled: 1 },
    remediation: { summary: 'Raise the token', effort: 'S', impact: 'high', verification: 're-run axe' },
    evidence: ['a1'],
    ...over,
  } as Finding;
}

describe('@domia/audit: scoring is deterministic and honest', () => {
  it('scores a clean, covered dimension at 100 and leaves uncovered dimensions unassessed', () => {
    const score = scoreAudit([], { accessibility: { executed: 12, applicable: 12 } });
    const a11y = score.dimensions.find((d) => d.dimension === 'accessibility');
    const perf = score.dimensions.find((d) => d.dimension === 'performance');

    expect(a11y?.score).toBe(100);
    expect(a11y?.grade).toBe('A');
    expect(perf?.score, 'an unassessed dimension has no score, not a default pass').toBeUndefined();
    expect(perf?.coverage.executed).toBe(0);
    expect(score.assessed).toBe(1);
  });

  it('weights a judgement below a machine verification', () => {
    const verified = findingWeight(finding({ confidence: 'verified' }));
    const probable = findingWeight(finding({ confidence: 'probable' }));
    const needsHuman = findingWeight(finding({ confidence: 'needs-human' }));
    expect(verified).toBeGreaterThan(probable);
    expect(probable).toBeGreaterThan(needsHuman);
  });

  it('caps a dimension with a verified blocker below passing, and reports the split', () => {
    const score = scoreAudit(
      [finding({ severity: 'blocker', confidence: 'verified' })],
      { accessibility: { executed: 10, applicable: 10 } },
    );
    const a11y = score.dimensions.find((d) => d.dimension === 'accessibility');
    expect(a11y?.cappedByBlocker).toBe(true);
    expect(a11y?.score).toBeLessThanOrEqual(49);
    expect(a11y?.grade).toBe('F');
    expect(a11y?.split.verified).toBeGreaterThan(0);
    expect(a11y?.split.probable).toBe(0);
    expect(a11y?.counts.blocker).toBe(1);
  });

  it('rolls up only assessed dimensions, weighted by the profile', () => {
    const score = scoreAudit([], {
      accessibility: { executed: 5, applicable: 5 },
      files: { executed: 3, applicable: 3 },
    });
    expect(score.overall).toBe(100);
    expect(score.assessed).toBe(2);
    expect(grade(100)).toBe('A');
  });
});

let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => { if (cleanup) { await cleanup(); cleanup = null; } });

describe('audit belt tools drive a real run end to end', () => {
  it('records findings with evidence, refuses unevidenced ones, and renders a report artifact', async () => {
    const script: AgentTurn[] = [
      { kind: 'act', calls: [{ name: 'audit.dimensions', args: {} }] },
      {
        kind: 'act',
        calls: [{
          name: 'audit.finding',
          args: {
            dimension: 'files', check: 'files.llms-txt', title: 'No /llms.txt',
            detail: 'The site publishes no machine-readable index for AI agents.',
            severity: 'moderate', confidence: 'verified', source: 'fetch',
            standards: ['llms.txt'],
            where: { url: 'https://example.com/llms.txt' },
            remediation: {
              summary: 'Publish /llms.txt listing the primary sections.',
              effort: 'S', impact: 'medium', verification: 'curl -sI https://example.com/llms.txt returns 200',
            },
            observed: 'HTTP/2 404 — content-type: text/html',
          },
        }],
      },
      {
        kind: 'act',
        calls: [{
          name: 'audit.finding',
          args: {
            dimension: 'files', check: 'files.security-txt', title: 'No security.txt',
            detail: 'No disclosure contact.', severity: 'minor', confidence: 'verified', source: 'fetch',
            where: { url: 'https://example.com/.well-known/security.txt' },
            remediation: { summary: 'Add security.txt', effort: 'S', impact: 'low', verification: 'fetch returns 200' },
            observed: 'HTTP/2 404 on /.well-known/security.txt',
          },
        }],
      },
      { kind: 'act', calls: [{ name: 'audit.coverage', args: { dimension: 'files', executed: 8, applicable: 12 } }] },
      { kind: 'act', calls: [{ name: 'audit.report', args: {} }] },
      { kind: 'final', summary: 'files dimension audited', verdict: 'fail' },
    ];

    const dataDir = tmpDir('audit');
    const booted = must(await bootHeadless({
      dataDir, artifactsDir: join(dataDir, 'artifacts'), dbPath: join(dataDir, 'domia.db'), logLevel: 'error',
      agent: { replay: () => script },
    }));
    const kernel: Kernel = booted.kernel;
    cleanup = async () => { await kernel.shutdown(); rmSync(dataDir, { recursive: true, force: true }); };

    const caseId = must(await kernel.resolve(EP.CaseService)._unsafeUnwrap().create({
      name: 'audit case', target: { kind: 'web', url: 'https://example.com' },
    })).id;

    const started = must(await startRun(kernel, { caseId, request: 'audit this site', model: REPLAY, maxTurns: 10 }));
    expect(started.outcome.status).toBe('ok');

    const audit = kernel.resolve(EP.AuditService)._unsafeUnwrap();
    const findings = audit.findings(started.runId);

    expect(findings.map((f) => f.check)).toEqual(['files.llms-txt', 'files.security-txt']);
    expect(findings[0]?.evidence.length, 'observed text is persisted as an evidence artifact').toBe(1);

    const unevidenced = await audit.record(started.runId, {
      dimension: 'seo', check: 'seo.title', title: 'no title', detail: '', severity: 'minor',
      confidence: 'probable', source: 'agent', where: { url: 'https://example.com' },
      remediation: { summary: 'add one', effort: 'S', impact: 'low', verification: 'view source' },
    });
    expect(unevidenced.isErr(), 'a finding without evidence is refused').toBe(true);

    const score = audit.score(started.runId);
    const files = score.dimensions.find((d) => d.dimension === 'files');
    expect(files?.coverage).toEqual({ executed: 8, applicable: 12 });
    expect(files?.score).toBeLessThan(100);
    expect(files?.counts.moderate).toBe(1);
    expect(score.assessed).toBe(1);

    const report = must(await audit.report(started.runId, 'https://example.com'));
    expect(report.markdown).toContain('## Scores by dimension');
    expect(report.markdown).toContain('No /llms.txt');
    expect(report.markdown).toContain('Not assessed');

    const store = kernel.resolve(EP.Store)._unsafeUnwrap();
    const artifacts = must(await store.artifacts.byRun(started.runId));
    expect(artifacts.some((a) => a.id === report.artifact.id)).toBe(true);
  }, 60_000);
});
